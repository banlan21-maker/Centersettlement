'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function ReportPage() {
    const supabase = createClient()
    const [sessions, setSessions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

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

    // Summary Metrics
    const summary = sessions.reduce((acc, s) => {
        const { totalRevenue, teacherPay, centerRevenue, clientCost } = calculateRow(s)
        return {
            revenue: acc.revenue + totalRevenue,
            clientCost: acc.clientCost + clientCost,
            teacherPay: acc.teacherPay + teacherPay,
            centerRevenue: acc.centerRevenue + centerRevenue
        }
    }, { revenue: 0, clientCost: 0, teacherPay: 0, centerRevenue: 0 })

    return (
        <div className="p-4 pb-24 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">정산 보고서</h1>
                <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={handleReset}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        정산 초기화
                    </Button>
                    <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Excel
                    </Button>
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
                        <CardTitle className="text-sm font-medium text-muted-foreground">선생님 급여</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-lg font-bold text-orange-600">{summary.teacherPay.toLocaleString()}원</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">총 청구액</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-lg font-bold">{summary.clientCost.toLocaleString()}원</div>
                    </CardContent>
                </Card>
            </div>

            {/* Detail Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">최근 수업 내역</CardTitle>
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
                            {sessions.map(s => {
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
                            {sessions.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                        기록이 없습니다.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
