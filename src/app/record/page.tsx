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
        breakdown: string[],
        voucherUsageMap?: Record<string, number>
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

        // 1. Calculate Time-Based Fee adjustment (if any)
        // User said "Use Center Base Fee (55000)" for multi.
        // But for time extension? "추가 수업료" logic usually applies to Base Fee.
        // Let's assume the "Base Fee" used for Multi includes time extensions if applicable.
        const durationMin = parseInt(duration) || 0
        let timeAdjustedBaseFee = baseFee
        if (durationMin > 40) {
            const extraTime = durationMin - 40
            const extraUnits = Math.ceil(extraTime / 10)
            timeAdjustedBaseFee += (extraUnits * extraFeeUnit)
        }

        const breakdown: string[] = []

        let sessionFee = 0
        let isMulti = selectedVouchers.length > 1

        // 2. Determine Session Fee Logic
        if (isMulti) {
            sessionFee = timeAdjustedBaseFee
            breakdown.push(`[복합결제] 센터 기본 수업료 적용: ${sessionFee.toLocaleString()}원`)
        } else if (selectedVouchers.length === 1) {
            const vid = selectedVouchers[0]
            const voucher = vouchers.find(v => v.id === vid)
            const clientVoucher = clientVouchers.find(cv => cv.client_id === selectedClient && cv.voucher_id === vid)

            const voucherFee = (voucher?.default_fee && voucher.default_fee > 0) ? voucher.default_fee : baseFee
            const copay = clientVoucher?.copay || 0

            // Single Mode: Fee is Voucher's Session Fee + Copay
            sessionFee = voucherFee + copay
            breakdown.push(`[단일결제] ${voucher?.name}`)
            breakdown.push(`- 바우처 기준 수가: ${voucherFee.toLocaleString()}원`)
            breakdown.push(`- 고정 본인부담금: ${copay.toLocaleString()}원`)
            breakdown.push(`= 1회 총 수업비: ${sessionFee.toLocaleString()}원`)
        } else {
            // No voucher
            sessionFee = timeAdjustedBaseFee
            breakdown.push(`[일반결제] 센터 기본 수업료: ${sessionFee.toLocaleString()}원`)
        }

        if (durationMin > 40 && !isMulti && selectedVouchers.length === 0) {
            breakdown.push(`(추가 시간 비용 포함됨)`)
        }


        // 3. Calculate Deduction & Client Cost
        let feeRemaining = sessionFee
        let totalDeducted = 0
        const voucherUsageMap: Record<string, number> = {}

        if (selectedVouchers.length > 0) {
            // Fetch usage for limits
            const startOfMonth = new Date(date)
            startOfMonth.setDate(1)
            const startStr = format(startOfMonth, 'yyyy-MM-dd')
            const endOfMonth = new Date(new Date(date).getFullYear(), new Date(date).getMonth() + 1, 0)
            const endStr = format(endOfMonth, 'yyyy-MM-dd')

            // Fetch usage in parallel
            const usages = await Promise.all(selectedVouchers.map(async vid => {
                const { data } = await supabase
                    .from('session_vouchers')
                    .select('used_amount, sessions!inner(date, client_id)')
                    .eq('voucher_id', vid)
                    .eq('sessions.client_id', selectedClient)
                    .gte('sessions.date', startStr)
                    .lte('sessions.date', endStr)
                const used = data?.reduce((sum, item) => sum + (item.used_amount || 0), 0) || 0
                return { vid, used }
            }))

            for (const vid of selectedVouchers) {
                if (feeRemaining <= 0) break // Covered

                const voucher = vouchers.find(v => v.id === vid)
                const usageInfo = usages.find(u => u.vid === vid)
                const usedAmount = usageInfo?.used || 0
                const limit = voucher?.support_amount || 0

                const remainingLimit = Math.max(0, limit - usedAmount)

                // Deduct from this voucher
                const deduction = Math.min(feeRemaining, remainingLimit)

                voucherUsageMap[vid] = deduction
                feeRemaining -= deduction
                totalDeducted += deduction

                breakdown.push(`--- ${voucher?.name} ---`)
                breakdown.push(`잔여 한도: ${remainingLimit.toLocaleString()} / 차감: -${deduction.toLocaleString()}`)
            }
        }

        // 4. Final Client Cost Calculation
        let finalClientCost = 0
        if (isMulti) {
            // Multi: Client pays whatever is NOT covered by limits
            finalClientCost = feeRemaining
            breakdown.push(`----------------`)
            breakdown.push(`총 한도 차감: -${totalDeducted.toLocaleString()}원`)
            breakdown.push(`차액 (내담자 부담): ${finalClientCost.toLocaleString()}원`)
        } else if (selectedVouchers.length === 1) {
            // Single: Client pays Fixed Copay + Any Excess (if limit exceeded)
            const vid = selectedVouchers[0]
            const clientVoucher = clientVouchers.find(cv => cv.client_id === selectedClient && cv.voucher_id === vid)
            const fixedCopay = clientVoucher?.copay || 0

            // Client pays Fixed Copay... PLUS any fee remaining?
            // "1회 수업료 6만원 = 바우처 차감(Limit deduction) 6만원". 
            // If Limit has space, deducted 60k. Client Cost = 10k (Fixed).
            // If Limit has 0 space, deducted 0. Client Cost = 10k + 50k(uncovered)? or 60k?
            // "한도 초과/미지원 차액" should be paid by client.
            // If covered: Cost = Fixed Copay.
            // If uncovered: Cost = Fixed Copay + Uncovered Amount.
            // But wait, if Deducted 60k includes the Copay portion (as per user's 60k example), 
            // then we shouldn't double charge.
            // Actually, in the user's example:
            // "1회당 6만원이 빠지는거지" (Deducted from Limit).
            // "개인부담금 1만원".
            // If the Limit tracks the Groos Value (Support + Copay), then the Voucher is basically a "Debit Card" loaded with Gross Limit.
            // And the Client pays 10k cash *to the center*? Or is 10k just a calculated value?
            // "내담자에게 돈을 더받던지.." -> Client pays cash.
            // If 60k deducted from Voucher, and Client pays 10k Cash. The Center gets 60k + 10k = 70k? No.
            // The 10k is likely "Copay" that is *part* of determining the 60k, but paid by client.
            // IF Limit covers 60k, does the Voucher provider pay 60k?
            // Usually Voucher pays (LimitDeduction - Copay).
            // So if Deducted 60k, and Copay is 10k, Voucher pays 50k.
            // Center revenue = 50k (Voucher) + 10k (Client) = 60k. Matches.
            // So, Client Cost is ALWAYS `Fixed Copay`. (Plus excess if limit reached).
            // But if Limit reached (Deducted 0), then Client pays Full 60k?
            // Yes.
            // So logic: ClientCost = FixedCopay + (SessionFee - Deducted - FixedCopay)? 
            // No.
            // If Deducted = 60k. ClientCost = 10k.
            // If Deducted = 0. ClientCost = 60k.
            // Formula: `ClientCost = SessionFee - (Deducted - FixedCopay)`? No.
            // If D=60, C=10. S=60. 60 - (60-10) = 10. Correct.
            // If D=0, C=10. S=60. 60 - (0 - 10)? No.
            // Let's look at coverage.
            // The "Voucher Support" part is what saves the client money.
            // Real Voucher Support = Deducted Amount - Fixed Copay.
            // (Assumes Deducted Amount always >= Fixed Copay. If not, only partial support).
            // Client Pay = Session Fee - Real Voucher Support.
            // = Session Fee - (Deducted - Fixed Copay) = Session Fee - Deducted + Fixed Copay.
            // Example: S=60, D=60, F=10. Pay = 60 - 60 + 10 = 10. Correct.
            // Example: S=60, D=0 (Empty). Pay = 60 - 0 + 10 = 70? No, should be 60.
            // Why? Because if no voucher, fixed copay logic might not apply or applies differently.
            // If Limit is 0, it's just a cash session.
            // But if we treat it as "Voucher used but empty":
            // Real Support from Voucher = Max(0, Deducted - Fixed Copay).
            // If D=0, Support=0. Pay = 60 - 0 = 60. Correct.
            // If D=40 (Partial), F=10. Support = 30. Pay = 60 - 30 = 30. Correct.
            // (Deducted 40 means 30 Gov + 10 User? Or just 40 Gov?)
            // User example: "60k deducted". This is "Gross".
            // So implicit Gov portion is 50k.
            // I will use: `Client Cost = Session Fee - Max(0, TotalDeducted - FixedCopay)`.
            // Wait, this assumes the "Deduction" contains the fixed copay.
            // Yes, user said "1회당 6만원(5+1)이 빠지는거지".

            const realSupport = Math.max(0, totalDeducted - fixedCopay)
            finalClientCost = sessionFee - realSupport

            breakdown.push(`----------------`)
            breakdown.push(`총 한도 차감: -${totalDeducted.toLocaleString()}원`)
            breakdown.push(`(실질 바우처 지원: -${realSupport.toLocaleString()}원)`)
            breakdown.push(`최종 본인부담금: ${finalClientCost.toLocaleString()}원`)

        } else {
            // General
            finalClientCost = sessionFee
        }

        setCalcResult({
            totalFee: sessionFee,
            voucherSupport: isMulti ? totalDeducted : Math.max(0, totalDeducted - (clientVouchers.find(cv => cv.voucher_id === selectedVouchers[0])?.copay || 0)),
            clientCost: finalClientCost,
            breakdown,
            voucherUsageMap
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
