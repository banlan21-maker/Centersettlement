'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

export default function RecordPage() {
    const supabase = createClient()
    const router = useRouter()

    const [teachers, setTeachers] = useState<any[]>([])
    const [clients, setClients] = useState<any[]>([])
    const [allClients, setAllClients] = useState<any[]>([]) // Cache for filtering
    const [vouchers, setVouchers] = useState<any[]>([])
    const [teacherAssignments, setTeacherAssignments] = useState<any[]>([])
    const [clientVouchers, setClientVouchers] = useState<any[]>([])

    // Center Settings
    const [centerSettings, setCenterSettings] = useState<any>(null)

    const [selectedTeacher, setSelectedTeacher] = useState('')
    const [selectedClient, setSelectedClient] = useState('')
    const [selectedVouchers, setSelectedVouchers] = useState<string[]>([])
    const [filteredClients, setFilteredClients] = useState<any[]>([])
    const [filteredVouchers, setFilteredVouchers] = useState<any[]>([])

    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [startTime, setStartTime] = useState('10:00')
    const [duration, setDuration] = useState('40')

    // Calculation Results
    const [calcResult, setCalcResult] = useState<{
        totalFee: number,
        voucherSupport: number,
        clientCost: number,
        breakdown: string[]
    } | null>(null)

    useEffect(() => {
        fetchData()
    }, [])

    useEffect(() => {
        if (selectedTeacher && selectedClient && centerSettings) {
            calculateFee()
        }
    }, [selectedTeacher, selectedClient, selectedVouchers, duration, date, centerSettings])

    const fetchData = async () => {
        const { data: t } = await supabase.from('teachers').select('*').eq('status', 'active')
        if (t) setTeachers(t)

        const { data: c } = await supabase.from('clients').select('*')
        if (c) {
            setClients(c)
            setAllClients(c)
            setFilteredClients(c)
        }

        const { data: v } = await supabase.from('vouchers').select('*')
        if (v) setVouchers(v)

        const { data: tc } = await supabase.from('teacher_clients').select('*')
        if (tc) setTeacherAssignments(tc)

        const { data: cv } = await supabase.from('client_vouchers').select('*')
        if (cv) setClientVouchers(cv)

        const { data: cs } = await supabase.from('center_settings').select('*').single()
        if (cs) setCenterSettings(cs)
        else {
            setCenterSettings({ base_fee: 55000, extra_fee_per_10min: 10000 })
        }
    }

    // Filter clients when teacher or assignments change
    useEffect(() => {
        if (!selectedTeacher) {
            setFilteredClients(allClients)
            return
        }
        const assignedClientIds = teacherAssignments
            .filter(a => a.teacher_id === selectedTeacher)
            .map(a => a.client_id)

        if (assignedClientIds.length > 0) {
            setFilteredClients(allClients.filter(c => assignedClientIds.includes(c.id)))
        } else {
            setFilteredClients([])
        }
    }, [selectedTeacher, allClients, teacherAssignments])

    // Filter vouchers when client changes
    useEffect(() => {
        if (!selectedClient) {
            setFilteredVouchers([])
            setSelectedVouchers([])
            return
        }
        const validVoucherIds = clientVouchers
            .filter(cv => cv.client_id === selectedClient)
            .map(cv => cv.voucher_id)

        const validVouchers = vouchers.filter(v => validVoucherIds.includes(v.id))
        setFilteredVouchers(validVouchers)
        setSelectedVouchers([])
    }, [selectedClient, clientVouchers, vouchers])


    const calculateFee = async () => {
        if (!selectedClient || !centerSettings) return

        const baseFee = centerSettings.base_fee || 55000
        const extraFeeUnit = centerSettings.extra_fee_per_10min || 10000

        // 1. Calculate Total Fee (Time based)
        const durationMin = parseInt(duration) || 0
        let totalFee = baseFee
        if (durationMin > 40) {
            const extraTime = durationMin - 40
            const extraUnits = Math.ceil(extraTime / 10)
            totalFee += (extraUnits * extraFeeUnit)
        }

        const breakdown: string[] = []
        breakdown.push(`기본 수업료: ${baseFee.toLocaleString()}원`)
        if (durationMin > 40) breakdown.push(`추가 수업료: +${(totalFee - baseFee).toLocaleString()}원 (${durationMin - 40}분)`)
        breakdown.push(`총 수업료: ${totalFee.toLocaleString()}원`)

        let feeRemaining = totalFee
        let totalSupport = 0
        let totalFixedCopay = 0

        // Track specific usage per voucher to save later
        const voucherUsageMap: Record<string, number> = {}

        // 2. Multi-Voucher Logic
        if (selectedVouchers.length > 0) {
            // Fetch session history for limit check for ALL selected vouchers
            const startOfMonth = new Date(date)
            startOfMonth.setDate(1)
            const startStr = format(startOfMonth, 'yyyy-MM-dd')
            // End of month
            const endOfMonth = new Date(new Date(date).getFullYear(), new Date(date).getMonth() + 1, 0)
            const endStr = format(endOfMonth, 'yyyy-MM-dd')

            for (const vid of selectedVouchers) {
                const voucher = vouchers.find(v => v.id === vid)
                const clientVoucher = clientVouchers.find(cv => cv.client_id === selectedClient && cv.voucher_id === vid)

                if (voucher && clientVoucher) {
                    const limit = voucher.support_amount || 0
                    const fixedCopay = clientVoucher.copay || 0

                    // Fetch actual usage from session_vouchers table
                    const { data: usageData } = await supabase
                        .from('session_vouchers')
                        .select('used_amount, sessions!inner(date, client_id)')
                        .eq('voucher_id', vid)
                        .eq('sessions.client_id', selectedClient)
                        .gte('sessions.date', startStr)
                        .lte('sessions.date', endStr)

                    const usedAmount = usageData?.reduce((sum, item) => sum + (item.used_amount || 0), 0) || 0
                    const remainingLimit = Math.max(0, limit - usedAmount)

                    // Calculate support from this voucher
                    // It covers remaining FEE up to its remaining LIMIT.
                    const support = Math.min(feeRemaining, remainingLimit)

                    feeRemaining -= support
                    totalSupport += support

                    // Fixed copay is added ONCE per voucher used? 
                    // Usually yes, if you use a voucher you pay the copay associated with it.
                    // But if support is 0 because limit is full, do you still pay copay?
                    // Let's assume yes, if selected, it applies. But if support is 0, maybe not?
                    // User said "1회 수업때 1개 이상의 바우처를 사용할수있음".
                    // Let's stick to simple rule: If selected, it contributes support and copay.
                    totalFixedCopay += fixedCopay

                    voucherUsageMap[vid] = support

                    breakdown.push(`--- ${voucher.name} ---`)
                    breakdown.push(`월 한도: ${limit.toLocaleString()} / 이번 달 사용: ${usedAmount.toLocaleString()}`)
                    breakdown.push(`잔여 한도: ${remainingLimit.toLocaleString()}`)
                    breakdown.push(`지원금 적용: -${support.toLocaleString()}원`)
                    breakdown.push(`고정 부담금: +${fixedCopay.toLocaleString()}원`)

                    if (remainingLimit === 0) breakdown.push(`⚠️ 한도 소진됨`)
                }
            }
        } else {
            breakdown.push(`(바우처 미사용)`)
        }

        // Final Client Cost = (Original Fee - Total Support) + Total Fixed Copays
        // Essentially: FeeRemaining (which is Excess) + Total Fixed Copays
        const finalClientCost = feeRemaining + totalFixedCopay

        if (feeRemaining > 0 && selectedVouchers.length > 0) {
            breakdown.push(`한도초과/미지원 차액: +${feeRemaining.toLocaleString()}원`)
        }
        breakdown.push(`최종 본인부담금: ${finalClientCost.toLocaleString()}원`)

        setCalcResult({
            totalFee,
            voucherSupport: totalSupport,
            clientCost: finalClientCost,
            breakdown,
            voucherUsageMap // Pass this to submit handler
        })
    }

    const handleSubmit = async () => {
        if (!selectedTeacher || !selectedClient || !date || !calcResult) return

        const { error: sessionError, data: session } = await supabase.from('sessions').insert({
            date: `${date} ${startTime}`,
            teacher_id: selectedTeacher,
            client_id: selectedClient,
            duration_minutes: parseInt(duration),
            total_fee: calcResult.totalFee,
            total_support: calcResult.voucherSupport,
            final_client_cost: calcResult.clientCost
        }).select().single()

        if (sessionError) {
            toast.error('저장 실패: ' + sessionError.message)
            return
        }

        if (selectedVouchers.length > 0) {
            const voucherLinks = selectedVouchers.map(vid => ({
                session_id: session.id,
                voucher_id: vid,
                used_amount: (calcResult as any).voucherUsageMap?.[vid] || 0
            }))
            await supabase.from('session_vouchers').insert(voucherLinks)
        }

        toast.success('수업 기록 저장 완료')
        router.push('/report')
    }

    return (
        <div className="p-4 max-w-lg mx-auto pb-24">
            <h1 className="text-2xl font-bold mb-4">수업 기록</h1>

            <div className="space-y-4">
                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium">수업 정보 입력</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-4">
                        {/* Date & Time Row */}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 mb-1 block">일자</label>
                                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
                            </div>
                            <div className="w-1/3">
                                <label className="text-xs text-gray-500 mb-1 block">시간</label>
                                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9" />
                            </div>
                        </div>

                        {/* Duration Select */}
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">수업 시간 (분)</label>
                            <Select value={duration} onValueChange={setDuration}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="시간 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="30">30분</SelectItem>
                                    <SelectItem value="40">40분 (기본)</SelectItem>
                                    <SelectItem value="50">50분</SelectItem>
                                    <SelectItem value="60">60분</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Teacher & Client Row */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">담당 선생님</label>
                                <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="선생님" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teachers.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">내담자</label>
                                <Select value={selectedClient} onValueChange={setSelectedClient} disabled={!selectedTeacher}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder={!selectedTeacher ? "-" : "내담자"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filteredClients.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name} {c.birth_date && `(${c.birth_date})`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Multi-Voucher Selection */}
                        {selectedClient && (
                            <div className="pt-2 border-t mt-2">
                                <label className="text-xs font-medium mb-2 block">적용 바우처 (다중 선택 가능)</label>
                                {filteredVouchers.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {filteredVouchers.map(v => (
                                            <div
                                                key={v.id}
                                                className={`
                                                    px-3 py-1.5 rounded-full text-xs border cursor-pointer transition-colors select-none
                                                    ${selectedVouchers.includes(v.id)
                                                        ? 'bg-primary text-primary-foreground border-primary font-medium'
                                                        : 'bg-white hover:bg-gray-50 text-gray-600'
                                                    }
                                                `}
                                                onClick={() => {
                                                    if (selectedVouchers.includes(v.id)) {
                                                        setSelectedVouchers(selectedVouchers.filter(id => id !== v.id))
                                                    } else {
                                                        setSelectedVouchers([...selectedVouchers, v.id])
                                                    }
                                                }}
                                            >
                                                {v.name}
                                                {selectedVouchers.includes(v.id) && <span className="ml-1">✓</span>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400">적용 가능한 바우처가 없습니다.</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Calculation Result */}
                {calcResult && (
                    <Card className="bg-slate-50 border-slate-200">
                        <CardHeader className="py-2 min-h-[auto]">
                            <CardTitle className="text-sm font-medium text-slate-700">예상 결제 내역</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 pb-3">
                            {calcResult.breakdown.map((line, idx) => (
                                <div key={idx} className={`text-xs flex justify-between ${line.includes('최종') ? 'font-bold text-sm mt-2 pt-2 border-t border-slate-300 text-slate-900' : 'text-slate-600'} ${line.includes('---') ? 'font-semibold text-slate-800 mt-1' : ''}`}>
                                    {line.includes(':') ? (
                                        <>
                                            <span>{line.split(':')[0]}</span>
                                            <span>{line.split(':')[1]}</span>
                                        </>
                                    ) : (
                                        <span className={line.includes('⚠️') ? 'text-red-500 font-medium' : ''}>{line}</span>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                <Button className="w-full h-11 text-base font-semibold" onClick={handleSubmit} disabled={!calcResult}>
                    기록 저장하기
                </Button>
            </div>
        </div>
    )
}
