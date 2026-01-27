'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, addWeeks, subWeeks, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type ViewMode = 'daily' | 'weekly' | 'monthly'

export default function ReportPage() {
    const supabase = createClient()
    const [sessions, setSessions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // View State
    const [viewMode, setViewMode] = useState<ViewMode>('monthly')
    const [currentDate, setCurrentDate] = useState(new Date())

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('sessions')
            .select(`
                *,
                teachers (name, commission_rate),
                clients (name),
                session_vouchers (
                    vouchers (name)
                )
            `)
            .order('date', { ascending: false })

        if (data) setSessions(data)
        setLoading(false)
    }

    const handleReset = async () => {
        if (!confirm('경고: 모든 정산 내역이 영구적으로 삭제됩니다. 계속하시겠습니까?')) return

        const { error } = await supabase.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000') // Delete all hack

        if (error) {
            toast.error('초기화 실패: ' + error.message)
        } else {
            toast.success('모든 정산 내역이 초기화되었습니다.')
            fetchData()
        }
    }

    // Calculations helper
    const calculateRow = (s: any) => {
        const totalRevenue = (s.total_support || 0) + (s.final_client_cost || 0)
        const rate = s.teachers?.commission_rate || 0
        const teacherPay = Math.floor(totalRevenue * (rate / 100))
        const centerRevenue = totalRevenue - teacherPay
        const clientCost = s.final_client_cost || 0

        return { totalRevenue, teacherPay, centerRevenue, clientCost }
    }

    // Filter Logic
    const getFilteredSessions = () => {
        let start, end

        if (viewMode === 'daily') {
            start = currentDate
            end = currentDate
        } else if (viewMode === 'weekly') {
            start = startOfWeek(currentDate, { weekStartsOn: 1 }) // Monday start
            end = endOfWeek(currentDate, { weekStartsOn: 1 })
        } else {
            start = startOfMonth(currentDate)
            end = endOfMonth(currentDate)
        }

        // Reset time part for comparison
        start.setHours(0, 0, 0, 0)
        end.setHours(23, 59, 59, 999)

        return sessions.filter(s => {
            const sessionDate = parseISO(s.date)
            return isWithinInterval(sessionDate, { start, end })
        })
    }

    const filteredSessions = getFilteredSessions()

    // Aggregations
    const summary = filteredSessions.reduce((acc, s) => {
        const { totalRevenue, teacherPay, centerRevenue, clientCost } = calculateRow(s)
        return {
            revenue: acc.revenue + totalRevenue,
            clientCost: acc.clientCost + clientCost,
            teacherPay: acc.teacherPay + teacherPay,
            centerRevenue: acc.centerRevenue + centerRevenue
        }
    }, { revenue: 0, clientCost: 0, teacherPay: 0, centerRevenue: 0 })

    // Group by Teacher
    const teacherSettlement = Object.values(filteredSessions.reduce((acc: any, s) => {
        const { teacherPay, totalRevenue } = calculateRow(s)
        const teacherId = s.teacher_id
        if (!acc[teacherId]) {
            acc[teacherId] = {
                id: teacherId,
                name: s.teachers?.name || 'Unknown',
                rate: s.teachers?.commission_rate,
                totalPay: 0,
                totalRevenueGenerated: 0,
                sessionCount: 0
            }
        }
        acc[teacherId].totalPay += teacherPay
        acc[teacherId].totalRevenueGenerated += totalRevenue
        acc[teacherId].sessionCount += 1
        return acc
    }, {}))

    // Group by Client
    const clientBilling = Object.values(filteredSessions.reduce((acc: any, s) => {
        const { clientCost } = calculateRow(s)
        const clientId = s.client_id
        if (!acc[clientId]) {
            acc[clientId] = {
                id: clientId,
                name: s.clients?.name || 'Unknown',
                totalCopay: 0,
                sessionCount: 0
            }
        }
        acc[clientId].totalCopay += clientCost
        acc[clientId].sessionCount += 1
        return acc
    }, {}))


    // Navigation Handlers
    const goPrev = () => {
        if (viewMode === 'daily') setCurrentDate(d => subDays(d, 1))
        else if (viewMode === 'weekly') setCurrentDate(d => subWeeks(d, 1))
        else setCurrentDate(d => subMonths(d, 1))
    }

    const goNext = () => {
        if (viewMode === 'daily') setCurrentDate(d => addDays(d, 1))
        else if (viewMode === 'weekly') setCurrentDate(d => addWeeks(d, 1))
        else setCurrentDate(d => addMonths(d, 1))
    }

    const formatDateRange = () => {
        if (viewMode === 'daily') return format(currentDate, 'yyyy년 MM월 dd일 (eee)', { locale: ko })
        else if (viewMode === 'weekly') {
            const start = startOfWeek(currentDate, { weekStartsOn: 1 })
            const end = endOfWeek(currentDate, { weekStartsOn: 1 })
            return `${format(start, 'MM.dd', { locale: ko })} ~ ${format(end, 'MM.dd', { locale: ko })}`
        }
        else return format(currentDate, 'yyyy년 MM월', { locale: ko })
    }

    return (
        <div className="p-4 pb-24 space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold">정산 보고서</h1>
                    <div className="flex gap-2">
                        <Button variant="destructive" size="sm" onClick={handleReset}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            초기화
                        </Button>
                        <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-2" />
                            Excel
                        </Button>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col md:flex-row justify-between items-center bg-white p-3 rounded-lg border gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-md">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1 text-sm rounded-sm transition-all ${viewMode === 'daily' ? 'bg-white shadow text-black font-medium' : 'text-gray-500'}`}
                        >
                            일간
                        </button>
                        <button
                            onClick={() => setViewMode('weekly')}
                            className={`px-3 py-1 text-sm rounded-sm transition-all ${viewMode === 'weekly' ? 'bg-white shadow text-black font-medium' : 'text-gray-500'}`}
                        >
                            주간
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`px-3 py-1 text-sm rounded-sm transition-all ${viewMode === 'monthly' ? 'bg-white shadow text-black font-medium' : 'text-gray-500'}`}
                        >
                            월간
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={goPrev}><ChevronLeft className="w-5 h-5" /></Button>
                        <div className="text-lg font-bold min-w-[140px] text-center">{formatDateRange()}</div>
                        <Button variant="ghost" size="icon" onClick={goNext}><ChevronRight className="w-5 h-5" /></Button>
                    </div>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">총 매출</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-lg font-bold">{summary.revenue.toLocaleString()}원</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">센터 순수익</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-lg font-bold text-blue-600">{summary.centerRevenue.toLocaleString()}원</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">선생님 지급액</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-lg font-bold text-orange-600">{summary.teacherPay.toLocaleString()}원</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">내담자 청구액</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-lg font-bold">{summary.clientCost.toLocaleString()}원</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Tabs */}
            <Tabs defaultValue="list" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="list">수업 목록</TabsTrigger>
                    <TabsTrigger value="teacher">선생님 정산</TabsTrigger>
                    <TabsTrigger value="client">내담자 청구</TabsTrigger>
                </TabsList>

                {/* 1. Session List Tab */}
                <TabsContent value="list">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">수업 내역 ({filteredSessions.length}건)</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[80px]">날짜</TableHead>
                                        <TableHead className="min-w-[100px]">고객/선생님</TableHead>
                                        <TableHead className="min-w-[120px]">바우처</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">전체매출</TableHead>
                                        <TableHead className="text-right whitespace-nowrap text-orange-600">선생님</TableHead>
                                        <TableHead className="text-right whitespace-nowrap text-blue-600">센터</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">본인부담</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredSessions.map(s => {
                                        const stats = calculateRow(s)
                                        return (
                                            <TableRow key={s.id}>
                                                <TableCell className="align-top">
                                                    <div className="font-medium text-xs">{s.date}</div>
                                                    <div className="text-[10px] text-gray-500">{s.duration_minutes}분</div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="font-medium text-sm">{s.clients?.name || 'Unknown'}</div>
                                                    <div className="text-xs text-gray-500">{s.teachers?.name || 'Unknown'} ({s.teachers?.commission_rate || 0}%)</div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="flex flex-col gap-1">
                                                        {s.session_vouchers && s.session_vouchers.length > 0 ? (
                                                            s.session_vouchers.map((sv: any, idx: number) => (
                                                                <span key={idx} className="text-[10px] bg-slate-100 px-1 py-0.5 rounded inline-block w-fit">
                                                                    {sv.vouchers?.name}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400">-</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right align-top font-medium text-sm">
                                                    {stats.totalRevenue.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right align-top text-orange-600 text-sm">
                                                    {stats.teacherPay.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right align-top text-blue-600 text-sm">
                                                    {stats.centerRevenue.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right align-top font-bold text-sm">
                                                    {stats.clientCost.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                    {filteredSessions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                                해당 기간 내 기록이 없습니다.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 2. Teacher Settlement Tab */}
                <TabsContent value="teacher">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">선생님별 지급액</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>선생님</TableHead>
                                        <TableHead className="text-right">수업 횟수</TableHead>
                                        <TableHead className="text-right">총 매출 기여</TableHead>
                                        <TableHead className="text-right font-bold text-orange-600">지급해야 할 금액</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {teacherSettlement.map((t: any) => (
                                        <TableRow key={t.id}>
                                            <TableCell>
                                                <div className="font-medium">{t.name}</div>
                                                <div className="text-xs text-gray-500">비율: {t.rate}%</div>
                                            </TableCell>
                                            <TableCell className="text-right">{t.sessionCount}회</TableCell>
                                            <TableCell className="text-right text-gray-500">{t.totalRevenueGenerated.toLocaleString()}원</TableCell>
                                            <TableCell className="text-right font-bold text-orange-600 text-lg">{t.totalPay.toLocaleString()}원</TableCell>
                                        </TableRow>
                                    ))}
                                    {teacherSettlement.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">내역이 없습니다.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 3. Client Billing Tab */}
                <TabsContent value="client">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">내담자별 청구액</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>내담자</TableHead>
                                        <TableHead className="text-right">수업 횟수</TableHead>
                                        <TableHead className="text-right font-bold">청구할 금액 (본인부담)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {clientBilling.map((c: any) => (
                                        <TableRow key={c.id}>
                                            <TableCell className="font-medium">{c.name}</TableCell>
                                            <TableCell className="text-right">{c.sessionCount}회</TableCell>
                                            <TableCell className="text-right font-bold text-lg">{c.totalCopay.toLocaleString()}원</TableCell>
                                        </TableRow>
                                    ))}
                                    {clientBilling.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-8 text-gray-500">내역이 없습니다.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
