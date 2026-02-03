'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, ClipboardList, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { ko } from 'date-fns/locale'

type VoucherUsage = {
    voucherId: string
    voucherName: string
    category: string
    monthlyCount: number
    usedThisMonth: number
    remaining: number
    rolloverToNext: number
}

type ClientUsage = {
    clientId: string
    clientName: string
    teacherIds: string[]
    teacherNames: string[]
    vouchers: VoucherUsage[]
}

export default function SessionsInfoPage() {
    const supabase = createClient()
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [clientUsages, setClientUsages] = useState<ClientUsage[]>([])
    const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
    const [teacherClients, setTeacherClients] = useState<{ teacher_id: string; client_id: string }[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all')
    const [showOnlyWithRollover, setShowOnlyWithRollover] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [currentMonth])

    const fetchData = async () => {
        setLoading(true)
        const start = startOfMonth(currentMonth)
        const end = endOfMonth(currentMonth)
        const prevStart = startOfMonth(subMonths(currentMonth, 1))
        const prevEnd = endOfMonth(subMonths(currentMonth, 1))
        const startStr = format(start, 'yyyy-MM-dd')
        const endStr = format(end, 'yyyy-MM-dd')
        const prevStartStr = format(prevStart, 'yyyy-MM-dd')
        const prevEndStr = format(prevEnd, 'yyyy-MM-dd')

        const [
            { data: clients },
            { data: clientVouchers },
            { data: vouchers },
            { data: teachersData },
            { data: tcData }
        ] = await Promise.all([
            supabase.from('clients').select('id, name').order('name'),
            supabase.from('client_vouchers').select('client_id, voucher_id, monthly_session_count, monthly_personal_burden'),
            supabase.from('vouchers').select('id, name, category'),
            supabase.from('teachers').select('id, name').eq('status', 'active').order('name'),
            supabase.from('teacher_clients').select('teacher_id, client_id')
        ])

        if (teachersData) setTeachers(teachersData)
        if (tcData) setTeacherClients(tcData)

        if (!clients || !clientVouchers || !vouchers) {
            setLoading(false)
            return
        }

        const result: ClientUsage[] = []

        for (const client of clients) {
            const cvs = clientVouchers.filter(cv => cv.client_id === client.id)
            if (cvs.length === 0) continue

            const voucherUsages: VoucherUsage[] = []

            for (const cv of cvs) {
                const voucher = vouchers.find(v => v.id === cv.voucher_id)
                const monthlyCount = cv.monthly_session_count || 4

                // 이번 달 사용 횟수
                const { data: thisMonthSessions } = await supabase
                    .from('session_vouchers')
                    .select('id, sessions!inner(date, client_id)')
                    .eq('voucher_id', cv.voucher_id)
                    .eq('sessions.client_id', client.id)
                    .gte('sessions.date', startStr)
                    .lte('sessions.date', endStr)

                const usedThisMonth = thisMonthSessions?.length || 0
                const remaining = Math.max(0, monthlyCount - usedThisMonth)
                const rolloverToNext = remaining

                voucherUsages.push({
                    voucherId: cv.voucher_id,
                    voucherName: voucher?.name || '알 수 없음',
                    category: voucher?.category === 'education_office' ? '교육청' : '정부',
                    monthlyCount,
                    usedThisMonth,
                    remaining,
                    rolloverToNext
                })
            }

            const teacherIds = (tcData || [])
                .filter(tc => tc.client_id === client.id)
                .map(tc => tc.teacher_id)
            const teacherNames = teacherIds
                .map(tid => (teachersData || []).find(t => t.id === tid)?.name)
                .filter(Boolean) as string[]

            result.push({
                clientId: client.id,
                clientName: client.name,
                teacherIds,
                teacherNames,
                vouchers: voucherUsages
            })
        }

        setClientUsages(result)
        setLoading(false)
    }

    const monthLabel = format(currentMonth, 'yyyy년 M월', { locale: ko })

    const filteredClientUsages = clientUsages.filter(client => {
        const matchSearch = !searchTerm || client.clientName.toLowerCase().includes(searchTerm.toLowerCase())
        const matchTeacher = selectedTeacherId === 'all' || client.teacherIds.includes(selectedTeacherId)
        const hasRollover = client.vouchers.some(v => v.rolloverToNext > 0)
        const matchRollover = !showOnlyWithRollover || hasRollover
        return matchSearch && matchTeacher && matchRollover
    })

    return (
        <div className="p-4 pb-24 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <ClipboardList className="w-6 h-6" />
                    수업횟수 및 보강 정보
                </h1>
            </div>

            {/* 월 선택 */}
            <Card className="mb-4">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="font-semibold text-lg">{monthLabel}</span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 필터 */}
            <Card className="mb-4">
                <CardContent className="p-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="내담자 이름으로 검색"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-600 mb-1.5 block">담당 선생님</label>
                        <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                            <SelectTrigger>
                                <SelectValue placeholder="선생님 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체</SelectItem>
                                {teachers.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showOnlyWithRollover}
                            onChange={e => setShowOnlyWithRollover(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm">전월 이월 있는 내담자만 보기</span>
                    </label>
                </CardContent>
            </Card>

            {/* 안내 */}
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                <p className="font-medium">💡 남은 횟수 이월</p>
                <p className="mt-1 text-blue-700">월 수업 횟수를 다 사용하지 않으면 남은 횟수가 다음 달로 자동 이월됩니다.</p>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : (
                <div className="space-y-4">
                    {filteredClientUsages.length > 0 && (
                        <p className="text-sm text-gray-500">
                            {filteredClientUsages.length}명 표시
                            {(searchTerm || selectedTeacherId !== 'all' || showOnlyWithRollover) && ` (전체 ${clientUsages.length}명 중)`}
                        </p>
                    )}
                    {filteredClientUsages.map(client => (
                        <Card key={client.clientId}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">{client.clientName}</CardTitle>
                                {client.teacherNames.length > 0 && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        담당: {client.teacherNames.join(', ')}
                                    </p>
                                )}
                            </CardHeader>
                            <CardContent className="pt-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs">바우처</TableHead>
                                            <TableHead className="text-xs text-center">월 횟수</TableHead>
                                            <TableHead className="text-xs text-center">이번 달 사용</TableHead>
                                            <TableHead className="text-xs text-center">남은 횟수</TableHead>
                                            <TableHead className="text-xs text-center text-green-600">다음 달 이월</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {client.vouchers.map(v => (
                                            <TableRow key={v.voucherId}>
                                                <TableCell className="text-sm">
                                                    <span>{v.voucherName}</span>
                                                    <span className="ml-1 text-[10px] text-gray-400">({v.category})</span>
                                                </TableCell>
                                                <TableCell className="text-center text-sm">{v.monthlyCount}회</TableCell>
                                                <TableCell className="text-center text-sm">{v.usedThisMonth}회</TableCell>
                                                <TableCell className="text-center text-sm">
                                                    <span className={v.remaining > 0 ? 'text-orange-600 font-medium' : ''}>
                                                        {v.remaining}회
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center text-sm font-medium text-green-600">
                                                    {v.rolloverToNext > 0 ? `+${v.rolloverToNext}회` : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}
                    {filteredClientUsages.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            {clientUsages.length === 0
                                ? '바우처가 등록된 내담자가 없습니다.'
                                : showOnlyWithRollover
                                    ? '전월 이월이 있는 내담자가 없습니다.'
                                    : '검색 조건에 맞는 내담자가 없습니다.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
