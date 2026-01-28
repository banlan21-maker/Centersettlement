'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Plus, User, Calendar as CalendarIcon, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'

export default function SchedulePage() {
    const supabase = createClient()
    const router = useRouter()

    // State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [rooms, setRooms] = useState<any[]>([])
    const [teachers, setTeachers] = useState<any[]>([])
    const [clients, setClients] = useState<any[]>([])
    const [schedules, setSchedules] = useState<any[]>([])

    // Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [selectedSlot, setSelectedSlot] = useState<{ roomId: string, time: string } | null>(null)

    // Form State
    const [newTeacherId, setNewTeacherId] = useState('')
    const [newClientIds, setNewClientIds] = useState<string[]>([]) // Multi-select
    const [newStartTime, setNewStartTime] = useState('')
    const [newDuration, setNewDuration] = useState('40')
    const [newMemo, setNewMemo] = useState('')

    // Detail Modal State
    const [selectedSchedule, setSelectedSchedule] = useState<any>(null)

    useEffect(() => {
        fetchBasicData()
    }, [])

    useEffect(() => {
        fetchSchedules()
    }, [date])

    const fetchBasicData = async () => {
        const { data: r } = await supabase.from('rooms').select('*').order('created_at')
        if (r) setRooms(r)

        const { data: t } = await supabase.from('teachers').select('*').eq('status', 'active')
        if (t) setTeachers(t)

        const { data: c } = await supabase.from('clients').select('*')
        if (c) setClients(c)
    }

    const fetchSchedules = async () => {
        // Fetch schedules for the selected date (00:00 to 23:59)
        const start = `${date}T00:00:00`
        const end = `${date}T23:59:59`

        // Join with schedule_clients
        const { data } = await supabase.from('schedules')
            .select(`
                *,
                teachers(name),
                schedule_clients(
                    client_id,
                    clients(name)
                )
            `)
            .gte('start_time', start)
            .lte('start_time', end)

        if (data) setSchedules(data)
    }

    const handleCreate = async () => {
        if (!selectedSlot || !newTeacherId || newClientIds.length === 0 || !newStartTime) {
            toast.error('필수 정보를 모두 입력해주세요.')
            return
        }

        // Calculate End Time
        const startDateTime = `${date}T${newStartTime}:00`
        const startDate = new Date(startDateTime)
        const endDate = new Date(startDate.getTime() + parseInt(newDuration) * 60000)
        const startIso = startDate.toISOString()
        const endIso = endDate.toISOString()

        // 1. Room Conflict Check
        const { data: conflicts } = await supabase
            .from('schedules')
            .select('id')
            .eq('room_id', selectedSlot.roomId)
            .lt('start_time', endIso)
            .gt('end_time', startIso)

        if (conflicts && conflicts.length > 0) {
            toast.error('이미 해당 강의실에 예약된 일정이 있습니다.')
            return
        }

        // 2. Teacher Conflict Check
        const { data: teacherConflicts } = await supabase
            .from('schedules')
            .select('id')
            .eq('teacher_id', newTeacherId)
            .lt('start_time', endIso)
            .gt('end_time', startIso)

        if (teacherConflicts && teacherConflicts.length > 0) {
            toast.error('해당 선생님은 이미 다른 수업이 예약되어 있습니다.')
            return
        }

        // 3. Client Conflict Check (Loop for each selected client)
        // This is a bit heavy, but safe. 
        // We need to check if ANY of the selected clients are in a schedule that overlaps.
        // The join query is complex. Simplest is to check `schedule_clients` link where schedule overlaps.
        // "Find schedules overlapping this time range" AND "Have one of newClientIds".

        // Step 3a: Find all overlapping schedules IDs first (regardless of room/teacher)
        const { data: overlappingScheds } = await supabase
            .from('schedules')
            .select('id')
            .lt('start_time', endIso)
            .gt('end_time', startIso)

        if (overlappingScheds && overlappingScheds.length > 0) {
            const overlapIds = overlappingScheds.map(s => s.id)
            // Step 3b: Check if any of these schedules contain our clients
            const { data: clientClashes } = await supabase
                .from('schedule_clients')
                .select('client_id, clients(name)')
                .in('schedule_id', overlapIds)
                .in('client_id', newClientIds)

            if (clientClashes && clientClashes.length > 0) {
                const names = clientClashes.map((c: any) => c.clients?.name).join(', ')
                toast.error(`다음 내담자는 이미 다른 수업이 예약되어 있습니다: ${names}`)
                return
            }
        }

        // Insert Schedule
        const { data: newSchedule, error } = await supabase.from('schedules').insert({
            room_id: selectedSlot.roomId,
            teacher_id: newTeacherId,
            // client_id: newClientIds[0], // Optional: keep primary client or null
            start_time: startIso,
            end_time: endIso,
            status: 'scheduled',
            memo: newMemo
        }).select().single()

        if (error) {
            toast.error('예약 실패: ' + error.message)
            return
        }

        // Insert Schedule Clients
        if (newSchedule) {
            const clientLinks = newClientIds.map(cid => ({
                schedule_id: newSchedule.id,
                client_id: cid
            }))
            const { error: linkError } = await supabase.from('schedule_clients').insert(clientLinks)
            if (linkError) {
                console.error('Failed to link clients', linkError)
                toast.error('일부 내담자 연결 실패')
            }
        }

        toast.success('예약되었습니다')
        setIsCreateOpen(false)
        resetForm()
        fetchSchedules()
    }

    const handleDelete = async () => {
        if (!selectedSchedule || !confirm('예약을 삭제하시겠습니까?')) return
        await supabase.from('schedules').delete().eq('id', selectedSchedule.id)
        setSelectedSchedule(null)
        fetchSchedules()
    }

    const handleComplete = () => {
        // Redirect to Record Page
        // Pre-fill ONLY Teacher, Date, Time. Leave Client empty for user to select.
        if (!selectedSchedule) return

        const startTime = new Date(selectedSchedule.start_time)
        const timeStr = startTime.toTimeString().slice(0, 5)
        const duration = (new Date(selectedSchedule.end_time).getTime() - startTime.getTime()) / 60000

        const params = new URLSearchParams()
        params.set('teacherId', selectedSchedule.teacher_id)
        // params.set('clientId', selectedSchedule.client_id) // Do NOT set client
        params.set('date', date)
        params.set('time', timeStr)
        params.set('duration', duration.toString())

        router.push(`/record?${params.toString()}`)
    }

    const resetForm = () => {
        setNewTeacherId('')
        setNewClientIds([])
        setNewStartTime('')
        setNewDuration('40')
        setNewMemo('')
    }

    // Timeline Helper
    const startHour = 9
    const endHour = 22
    const hourWidth = 100 // px
    const totalWidth = (endHour - startHour) * hourWidth

    const getPosition = (isoString: string) => {
        const d = new Date(isoString)
        const h = d.getHours()
        const m = d.getMinutes()
        const minutesFromStart = (h - startHour) * 60 + m
        return (minutesFromStart / 60) * hourWidth
    }

    const getWidth = (startIso: string, endIso: string) => {
        const s = new Date(startIso)
        const e = new Date(endIso)
        const diffMinutes = (e.getTime() - s.getTime()) / 60000
        return (diffMinutes / 60) * hourWidth
    }

    // Toggle Client in Multi-Select
    const toggleClient = (cid: string) => {
        setNewClientIds(prev =>
            prev.includes(cid) ? prev.filter(id => id !== cid) : [...prev, cid]
        )
    }

    return (
        <div className="flex flex-col h-screen pb-16">
            {/* Header */}
            <div className="p-4 bg-white border-b flex justify-between items-center">
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    시간표
                </h1>
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => {
                        const d = new Date(date)
                        d.setDate(d.getDate() - 1)
                        setDate(d.toISOString().split('T')[0])
                    }}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="font-semibold text-lg">{date}</span>
                    <Button variant="outline" size="icon" onClick={() => {
                        const d = new Date(date)
                        d.setDate(d.getDate() + 1)
                        setDate(d.toISOString().split('T')[0])
                    }}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
                <div className="w-8"></div> {/* Spacer */}
            </div>

            {/* Timeline Area (Scrollable) */}
            <div className="flex-1 overflow-auto bg-slate-50 relative">
                <div className="min-w-max p-4">
                    {/* Time Header */}
                    <div className="flex mb-4 ml-24">
                        {Array.from({ length: endHour - startHour }).map((_, i) => (
                            <div key={i} className="flex-shrink-0 text-xs text-slate-500 border-l border-slate-300 pl-1" style={{ width: hourWidth }}>
                                {startHour + i}:00
                            </div>
                        ))}
                    </div>

                    {/* Rooms Rows */}
                    <div className="space-y-4">
                        {rooms.map(room => (
                            <div key={room.id} className="flex relative items-center h-20">
                                {/* Room Name */}
                                <div className="w-24 flex-shrink-0 font-medium text-sm text-slate-700 top-0 sticky left-0 bg-slate-50 z-10 h-full flex items-center">
                                    {room.name}
                                </div>

                                {/* Track */}
                                <div className="relative border-t border-b border-slate-200 bg-white h-full" style={{ width: totalWidth }}>
                                    {/* Grid Lines */}
                                    {Array.from({ length: endHour - startHour }).map((_, i) => (
                                        <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: (i + 1) * hourWidth }}></div>
                                    ))}

                                    {/* Clickable Area for creating new schedule */}
                                    <div
                                        className="absolute inset-0 z-0 cursor-pointer"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            const x = e.clientX - rect.left
                                            const hourIndex = Math.floor(x / hourWidth)
                                            const clickedHour = startHour + hourIndex
                                            const minuteRemainder = (x % hourWidth) / hourWidth
                                            const clickedMinute = minuteRemainder < 0.5 ? '00' : '30'
                                            const timeString = `${clickedHour.toString().padStart(2, '0')}:${clickedMinute}`

                                            setSelectedSlot({ roomId: room.id, time: timeString })
                                            setNewStartTime(timeString)
                                            setIsCreateOpen(true)
                                        }}
                                    ></div>

                                    {/* Schedule Blocks */}
                                    {schedules.filter(s => s.room_id === room.id).map(sch => {
                                        const startTime = new Date(sch.start_time)
                                        const endTime = new Date(sch.end_time)
                                        const timeDisplay = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}-${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`

                                        // Collect Client Names
                                        const clientNames = sch.schedule_clients?.map((sc: any) => sc.clients?.name).join(', ') || '내담자 없음'

                                        return (
                                            <div
                                                key={sch.id}
                                                className={`
                                                    absolute top-2 bottom-2 rounded px-2 py-1 text-xs cursor-pointer overflow-hidden leading-tight flex flex-col justify-center
                                                    ${sch.status === 'completed' ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-blue-100 text-blue-700 border-blue-200 border shadow-sm hover:ring-2 ring-blue-400'}
                                                `}
                                                style={{
                                                    left: getPosition(sch.start_time),
                                                    width: getWidth(sch.start_time, sch.end_time),
                                                    zIndex: 10
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSelectedSchedule(sch)
                                                }}
                                                title={`${timeDisplay} ${sch.teachers?.name} [${clientNames}]`}
                                            >
                                                <div className="font-bold truncate text-[10px]">{timeDisplay}</div>
                                                <div className="font-semibold truncate">{clientNames}</div>
                                                <div className="truncate text-[10px] opacity-90">{sch.teachers?.name}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                        {rooms.length === 0 && (
                            <div className="text-center py-10 text-gray-400">
                                설정을 통해 강의실을 먼저 등록해주세요.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Schedule Modal */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>새 예약 등록</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium mb-1 block">시작 시간</label>
                                <Input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1 block">진행 시간 (분)</label>
                                <Select value={newDuration} onValueChange={setNewDuration}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="30">30분</SelectItem>
                                        <SelectItem value="40">40분</SelectItem>
                                        <SelectItem value="50">50분</SelectItem>
                                        <SelectItem value="60">60분</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium mb-1 block">담당 선생님</label>
                            <Select value={newTeacherId} onValueChange={setNewTeacherId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="선생님 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                    {teachers.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-xs font-medium mb-2 block">내담자 (다중 선택 가능)</label>
                            <div className="h-40 overflow-y-auto border rounded p-2 bg-slate-50 grid grid-cols-2 gap-2">
                                {clients.map(c => (
                                    <div key={c.id} className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id={`client-${c.id}`}
                                            checked={newClientIds.includes(c.id)}
                                            onChange={() => toggleClient(c.id)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label htmlFor={`client-${c.id}`} className="text-sm cursor-pointer select-none">
                                            {c.name}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>취소</Button>
                        <Button onClick={handleCreate}>예약하기</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View/Action Schedule Modal */}
            <Dialog open={!!selectedSchedule} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>예약 상세</DialogTitle>
                    </DialogHeader>
                    {selectedSchedule && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 text-sm gap-y-2">
                                <span className="text-gray-500">시간</span>
                                <span className="font-medium">
                                    {new Date(selectedSchedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    ~
                                    {new Date(selectedSchedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>

                                <span className="text-gray-500">담당 선생님</span>
                                <span className="font-medium">{selectedSchedule.teachers?.name}</span>

                                <span className="text-gray-500">내담자</span>
                                <span className="font-medium">
                                    {selectedSchedule.schedule_clients?.map((sc: any) => sc.clients?.name).join(', ') || '-'}
                                </span>

                                <span className="text-gray-500">강의실</span>
                                <span className="font-medium">{rooms.find(r => r.id === selectedSchedule.room_id)?.name}</span>
                            </div>

                            {selectedSchedule.status !== 'completed' ? (
                                <Button className="w-full" size="lg" onClick={handleComplete}>
                                    수업 시작 (정산 입력으로 이동)
                                </Button>
                            ) : (
                                <div className="p-4 bg-gray-100 text-center rounded text-gray-500 font-medium">
                                    이미 완료된 수업입니다.
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter className="flex justify-between sm:justify-between">
                        <Button variant="destructive" onClick={handleDelete}>삭제</Button>
                        <Button variant="outline" onClick={() => setSelectedSchedule(null)}>닫기</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
