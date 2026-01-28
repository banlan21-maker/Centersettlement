'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'

function RecordContent() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()

    // Query Params for Pre-filling (from Schedule)
    const qDate = searchParams.get('date')
    const qTime = searchParams.get('time')
    const qDuration = searchParams.get('duration')
    const qTeacherId = searchParams.get('teacherId')
    const qClientId = searchParams.get('clientId')

    const [teachers, setTeachers] = useState<any[]>([])
    const [clients, setClients] = useState<any[]>([])
    const [allClients, setAllClients] = useState<any[]>([]) // Cache for filtering
    const [vouchers, setVouchers] = useState<any[]>([])
    const [teacherAssignments, setTeacherAssignments] = useState<any[]>([])
    const [clientVouchers, setClientVouchers] = useState<any[]>([])

    // Center Settings
    const [centerSettings, setCenterSettings] = useState<any>(null)

    const [selectedTeacher, setSelectedTeacher] = useState(qTeacherId || '')
    const [selectedClient, setSelectedClient] = useState(qClientId || '')
    const [selectedVouchers, setSelectedVouchers] = useState<string[]>([])
    const [filteredClients, setFilteredClients] = useState<any[]>([])
    const [filteredVouchers, setFilteredVouchers] = useState<any[]>([])

    const [date, setDate] = useState(qDate || format(new Date(), 'yyyy-MM-dd'))
    const [startTime, setStartTime] = useState(qTime || '10:00')
    const [duration, setDuration] = useState(qDuration || '40')

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

        // Fetch usages early for logic
        let usages: { vid: string, used: number }[] = []
        if (selectedVouchers.length > 0) {
            const startOfMonth = new Date(date)
            startOfMonth.setDate(1)
            const startStr = format(startOfMonth, 'yyyy-MM-dd')
            const endOfMonth = new Date(new Date(date).getFullYear(), new Date(date).getMonth() + 1, 0)
            const endStr = format(endOfMonth, 'yyyy-MM-dd')

            usages = await Promise.all(selectedVouchers.map(async vid => {
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
        }

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

            // New Logic: Monthly Based Calculation
            const monthlySupportTotal = voucher?.support_amount || 0 // Total Monthly Value (Gov + Personal)
            const monthlyCount = clientVoucher?.monthly_session_count || 4
            const monthlyBurden = clientVoucher?.monthly_personal_burden || 0

            // Base Session Calculation
            const baseSessionFee = Math.floor(monthlySupportTotal / monthlyCount)
            const baseSessionBurden = Math.floor(monthlyBurden / monthlyCount)
            const baseSessionSupport = baseSessionFee - baseSessionBurden

            // Overtime Calculation
            let extraCost = 0
            const durationMin = parseInt(duration) || 0
            if (durationMin > 40) {
                const extraTime = durationMin - 40
                const extraUnits = Math.ceil(extraTime / 10)
                extraCost = extraUnits * extraFeeUnit
            }

            // Final Session Totals
            sessionFee = baseSessionFee + extraCost
            const sessionBurden = baseSessionBurden + extraCost
            const sessionSupport = baseSessionSupport

            breakdown.push(`[단일결제] ${voucher?.name}`)
            breakdown.push(`- 월 총액: ${monthlySupportTotal.toLocaleString()}원 / 월 ${monthlyCount}회`)
            breakdown.push(`- 1회 기본 수업료: ${baseSessionFee.toLocaleString()}원`)
            breakdown.push(`- 1회 기본 본인부담금: ${baseSessionBurden.toLocaleString()}원`)

            if (extraCost > 0) {
                breakdown.push(`- 추가 시간 비용(+${(durationMin - 40)}분): ${extraCost.toLocaleString()}원 (전액 본인부담)`)
            }

            breakdown.push(`= 1회 최종 수업료: ${sessionFee.toLocaleString()}원`)
            breakdown.push(`= 최종 본인부담금: ${sessionBurden.toLocaleString()}원`)
            breakdown.push(`= 바우처 지원금: ${sessionSupport.toLocaleString()}원`)

            // Set specific client cost directly here to avoid re-calculation in deduction logic, 
            // but we still need deduction logic for checking limits (though limits are less relevant if we just calculate from monthly).
            // However, we should still track "used_amount" for the voucher.
            // Used amount for voucher = sessionSupport? Or sessionFee?
            // "바우처의 월 지원금은 ... 차감해나가고" -> usually means the Total Voucher Amount is decremented.
            // But checking limits: "월 바우처 지원금과 월 본인 부담금을 다소진하고"
            // If we use the "Calculated" fee, we deduct that from the limit.

            // Allow the deduction logic below to run, but we need to ensure "Client Cost" is set to our calculated `sessionBurden`
            // and NOT re-derived from "Total - Support" if "Support" is capped by remaining limit.
            // Actually, if limit is reached, User pays more? 
            // "다소진하고 다 센터에 부담하게끔 하는게 목표다" -> "Everything else to Center (User pays?)"
            // Text: "다소진하고 다 센터에 부담하게끔" -> "Have Center bear it"? No, "Have (Client) pay to Center".
            // If limit is exhausted, Client pays the rest.
            // So we can let deduction logic handle the "Limit Check".

            // But we need to define the "Deductible Amount" (Target Support).
            // The Target Deductible from Voucher is `sessionSupport` (or `baseSessionFee` if the voucher tracks Total).
            // User: "200000-20000=180000... 차감".
            // Deducting 50,000 (Total) or 45,000 (Support)? 
            // "1회 수업당 200000/4=50000(1회당 수업료)으로 계산해서 차감해나가고"
            // This clearly says deduct 50,000 from the 200,000 pot.
            // So we deduct `sessionFee` (excluding extra cost? or including?).
            // "20000/4=5000 해서 ... 본인 부담금이 쌓인다".
            // It seems we track "Total Used" vs "Total Limit".

            // We'll treat `sessionFee` (Base) as the amount to deduct from `voucher.support_amount`.
            // Extra cost is separate (purely client).

            // Override the logic below:
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

        let feeRemaining = sessionFee
        let totalDeducted = 0
        const voucherUsageMap: Record<string, number> = {}

        // For Multi or if we didn't handle it in Single block (Refactor legacy flow if needed, but Single block now handles everything)
        // If Single block set 'totalDeducted', we assume it's done.
        // But the code below iterates again? 
        // We should wrap the below logic in `if (isMulti)` or check if we already processed.
        // Actually, for Single case, we fully calculated `finalClientCost` and `totalDeducted`.
        // We should skip the loop below if Single.

        if (selectedVouchers.length > 0 && isMulti) {
            // Original Deduction Logic for Multi (or Fallback)
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
            // Single Voucher Logic (New)
            // We calculated target fee above.
            // We just need to check if we have enough limit?
            // User's logic implies a fixed schedule "Monthly Limit / Count".
            // If they run out? "Exhaust and pay remaining".

            const vid = selectedVouchers[0]
            const voucher = vouchers.find(v => v.id === vid)
            const usageInfo = usages.find(u => u.vid === vid)
            const usedAmount = usageInfo?.used || 0
            const limit = voucher?.support_amount || 0 // Total Limit

            const clientVoucher = clientVouchers.find(cv => cv.client_id === selectedClient && cv.voucher_id === vid)
            const monthlyCount = clientVoucher?.monthly_session_count || 4
            const monthlyBurden = clientVoucher?.monthly_personal_burden || 0

            const baseSessionFee = Math.floor(limit / monthlyCount)
            const baseSessionBurden = Math.floor(monthlyBurden / monthlyCount)

            // Extra Cost
            const durationMin = parseInt(duration) || 0
            let extraCost = 0
            if (durationMin > 40) {
                const extraTime = durationMin - 40
                const extraUnits = Math.ceil(extraTime / 10)
                extraCost = extraUnits * extraFeeUnit
            }

            // Deduct Base Fee from Limit
            const remainingLimit = Math.max(0, limit - usedAmount)
            const deduction = Math.min(baseSessionFee, remainingLimit)

            totalDeducted = deduction // This is what we deduct from the Voucher (Total Pot)
            voucherUsageMap[vid] = deduction

            // Client Cost:
            // 1. Uncovered Base Fee (if limit exceeded)
            const uncoveredBase = baseSessionFee - deduction
            // 2. Base Burden (if covered, we still pay Burden. If uncovered, we pay Full? 
            // "Total" pot includes burden.
            // If we deduct 50,000 from 200,000.
            // Client pays 5,000.
            // If 50,000 is fully deducted, it implies Gov pays 45k, Client 5k.
            // The "Deduction" records the CONSUMPTION of the voucher.

            // Wait, if `deduction` (from param `used_amount` in session_vouchers) counts towards the limit.
            // And User says "Deduct 50,000".
            // We save `used_amount` = 50,000.
            // And `final_client_cost`.

            // What if limit is zero?
            // Deduction = 0.
            // Uncovered = 50,000.
            // Client pays 50,000 + Extra.

            // What if limit exists?
            // Deduction = 50,000.
            // Client pays 5,000 + Extra. (Normally).

            // So Client pays: `baseSessionBurden` + `uncoveredBase`? 
            // If Uncovered = 0 (Fully covered): Client pays `baseSessionBurden`.
            // If Uncovered = 50,000 (No limit): Client pays 50,000.
            // -> Logic: Client Pay = `baseSessionBurden` + `(baseSessionFee - deduction - baseSessionBurden_portion_of_uncovered?)`
            // No, simpler: 
            // "Limit" (200k) includes "Burden" (20k).
            // If we deduct 50k from Limit. Client pays 5k.
            // This 5k is PART of the 50k deduction?
            // "20000/4=5000 ... 본인 부담금이 쌓인다"
            // Using "Total Limit" approach, the client pays the burden regardless.
            // AND if the limit is exhausted, the client pays the *rest* of the fee.

            // Let's assume:
            // Standard Client Cost = `baseSessionBurden` + `extraCost`.
            // Shortfall = `baseSessionFee` - `deduction`.
            // If Shortfall > 0 (Limit exceeded), Client pays Shortfall INSTEAD OF Coverage?
            // No, Shortfall adds to cost.

            // Case 1: Covered. Deduction = 50k. Remaining Fee = 0.
            // we want Client Cost = 5k.

            // Case 2: Empty. Deduction = 0. Remaining Fee = 50k.
            // We want Client Cost = 50k.

            // Formula: `finalClientCost` = `baseSessionBurden` + `(baseSessionFee - deduction)` + `extraCost`?
            // Test Case 1: 5k + (50k - 50k) = 5k. Correct.
            // Test Case 2: 5k + (50k - 0) = 55k. Correct. (Client pays 5k burden + 50k shortfall? No, if shortfall is 50k, that is the WHOLE fee. 5k burden is INCLUDED in the 50k).
            // So if Uncovered, we shouldn't pay 5k + 50k. Use Max?
            // Note: `baseSessionBurden` is the client's share *within* the `baseSessionFee`.
            // So valid share of coverage = `deduction` * (Burden/Fee ratio)? No.

            // Let's stick to "Deduction is the Voucher Usage".
            // Voucher Usage covers the fee.
            // If Usage = 50k. Fee = 50k.
            // Client contribution inside that 50k is 5k.
            // So Gov contribution is 45k.
            // `finalClientCost` in `sessions` table usually means "Amount Client Transfer to Center".
            // So 5k.

            // If Usage = 0. Fee = 50k.
            // Client pays 50k.

            // Formula: `finalClientCost` = `(baseSessionFee - deduction)` + `(deduction > 0 ? baseSessionBurden : 0)` ?
            // If partial deduction? e.g. 25k remaining.
            // Deduction = 25k.
            // Uncovered = 25k.
            // Client pays Uncovered (25k) + Burden on Covered (2.5k)? = 27.5k.
            // Seems reasonable.

            // Let's use:
            // `burdenRatio` = `baseSessionBurden` / `baseSessionFee` (approx).
            // or just `baseSessionBurden` if full coverage.

            // Safe logic: calculated Client Cost = Uncovered Amount + (Covered Amount * Burden/Fee Ratio).
            // But simpler: `finalClientCost` = `sessionFee` - `(deduction - calculated_burden_for_deduction)`.
            // calculated_burden_for_deduction = `deduction` * (`baseSessionBurden` / `baseSessionFee`).

            // However, strictly adhering to User:
            // "20000-20000=180000... 1회당 50000... 본인부담금 5000".
            // "다소진하고 다 센터에 부담하게끔" -> Exhaust limit (which is 200k).

            // So:
            // `realGovSupport` = `deduction` - `burden_part`.
            // `finalClientCost` = `sessionFee` - `realGovSupport`.

            // `burden_part` for `deduction`:
            // If `deduction` == `baseSessionFee`, `burden_part` = `baseSessionBurden`.
            // If partial, proportional.
            const burdenPart = deduction > 0 ? (deduction * (baseSessionBurden / baseSessionFee)) : 0
            const realGovSupport = deduction - burdenPart

            finalClientCost = (sessionFee - deduction) + burdenPart + extraCost // Wait
            // `sessionFee` includes `extraCost`? 
            // `sessionFee` from above block was `baseSessionFee + extraCost`.
            // `deduction` is from `baseSessionFee`.

            // Let's recalculate accurately here.

            // Final Logic:
            const coveredAmount = deduction
            const coveredBurden = Math.floor(coveredAmount * (baseSessionBurden / baseSessionFee))
            const govSupport = coveredAmount - coveredBurden

            finalClientCost = sessionFee - govSupport

            breakdown.push(`----------------`)
            breakdown.push(`총 한도 차감: -${totalDeducted.toLocaleString()}원`)
            breakdown.push(`(실질 정부 지원: -${govSupport.toLocaleString()}원)`)
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
            <h1 className="text-2xl font-bold mb-4">수업입력</h1>

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

export default function RecordPage() {
    return (
        <Suspense fallback={<div className="p-4 text-center">로딩중...</div>}>
            <RecordContent />
        </Suspense>
    )
}
