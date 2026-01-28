'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Pencil, Trash2, X, Check, Search } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function SettingsPage() {
    const supabase = createClient()

    // Teachers State
    const [teachers, setTeachers] = useState<any[]>([])
    const [newTeacherName, setNewTeacherName] = useState('')
    const [newTeacherBirthDate, setNewTeacherBirthDate] = useState('')
    const [newTeacherPhone, setNewTeacherPhone] = useState('')
    const [newTeacherRate, setNewTeacherRate] = useState('')
    const [managingTeacherId, setManagingTeacherId] = useState<string | null>(null)
    const [teacherStudentSelections, setTeacherStudentSelections] = useState<Record<string, boolean>>({})
    const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)

    // Vouchers State
    const [vouchers, setVouchers] = useState<any[]>([])
    const [newVoucherName, setNewVoucherName] = useState('')
    const [newVoucherSupport, setNewVoucherSupport] = useState('')
    const [newVoucherDefaultFee, setNewVoucherDefaultFee] = useState('')
    const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null)

    // Clients State
    const [clients, setClients] = useState<any[]>([])

    // ... (Lines 34-235)

    // --- Vouchers ---
    const addVoucher = async () => {
        if (!newVoucherName) return
        const { error } = await supabase.from('vouchers').insert({
            name: newVoucherName,
            support_amount: parseInt(newVoucherSupport) || 0,
            default_fee: parseInt(newVoucherDefaultFee) || 0,
            client_copay: 0
        })
        if (error) toast.error('실패: ' + error.message)
        else {
            toast.success('바우처 추가 완료')
            resetVoucherForm()
            fetchData()
        }
    }

    const updateVoucher = async () => {
        if (!editingVoucherId || !newVoucherName) return
        const { error } = await supabase.from('vouchers').update({
            name: newVoucherName,
            support_amount: parseInt(newVoucherSupport) || 0,
            default_fee: parseInt(newVoucherDefaultFee) || 0
        }).eq('id', editingVoucherId)

        if (error) toast.error('수정 실패: ' + error.message)
        else {
            toast.success('바우처 정보 수정 완료')
            resetVoucherForm()
            fetchData()
        }
    }

    const startEditVoucher = (v: any) => {
        setEditingVoucherId(v.id)
        setNewVoucherName(v.name)
        setNewVoucherSupport(v.support_amount?.toString() || '')
        setNewVoucherDefaultFee(v.default_fee?.toString() || '')
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const resetVoucherForm = () => {
        setEditingVoucherId(null)
        setNewVoucherName('')
        setNewVoucherSupport('')
        setNewVoucherDefaultFee('')
    }

    const deleteVoucher = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return
        await supabase.from('vouchers').delete().eq('id', id)
        fetchData()
    }

    // (Lines 286-533 unchanged)


    const [filteredClients, setFilteredClients] = useState<any[]>([]) // Displayed clients
    const [newClientName, setNewClientName] = useState('')
    const [newClientBirthDate, setNewClientBirthDate] = useState('')
    const [newClientPhone, setNewClientPhone] = useState('')
    const [clientVoucherSelections, setClientVoucherSelections] = useState<Record<string, { selected: boolean, count: string, burden: string }>>({})
    const [editingClientId, setEditingClientId] = useState<string | null>(null)

    // Client Filter State
    const [clientSearchQuery, setClientSearchQuery] = useState('')
    const [clientVoucherFilter, setClientVoucherFilter] = useState('all')

    // Center Settings State
    const [centerSettings, setCenterSettings] = useState<any>({})
    const [centerName, setCenterName] = useState('')
    const [businessNumber, setBusinessNumber] = useState('')
    const [repName, setRepName] = useState('')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [baseFee, setBaseFee] = useState('55000')
    const [extraFee, setExtraFee] = useState('10000')

    // Rooms State
    const [rooms, setRooms] = useState<any[]>([])
    const [newRoomName, setNewRoomName] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    // Filter Logic
    useEffect(() => {
        let result = clients

        // 1. Name Search
        if (clientSearchQuery) {
            result = result.filter(c => c.name.includes(clientSearchQuery))
        }

        // 2. Voucher Filter
        if (clientVoucherFilter && clientVoucherFilter !== 'all') {
            result = result.filter(c =>
                c.client_vouchers && c.client_vouchers.some((cv: any) => cv.voucher_id === clientVoucherFilter)
            )
        }

        setFilteredClients(result)
    }, [clients, clientSearchQuery, clientVoucherFilter])

    const fetchData = async () => {
        try {
            const { data: t } = await supabase.from('teachers').select('*').order('created_at', { ascending: false })
            if (t) setTeachers(t)

            const { data: v } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false })
            if (v) {
                setVouchers(v)
                // Initialize selections only if not editing currently to avoid overwrite
                if (!editingClientId) {
                    const initialSelections: Record<string, { selected: boolean, count: string, burden: string }> = {}
                    v.forEach(voucher => {
                        initialSelections[voucher.id] = { selected: false, count: '4', burden: '0' }
                    })
                    setClientVoucherSelections(initialSelections)
                }
            }

            const { data: c } = await supabase.from('clients').select('*, client_vouchers(voucher_id, copay, monthly_session_count, monthly_personal_burden, vouchers(name))').order('created_at', { ascending: false })
            if (c) {
                setClients(c)
                setFilteredClients(c)
            }

            // Fetch Center Settings
            const { data: cs } = await supabase.from('center_settings').select('*').single()
            if (cs) {
                setCenterSettings(cs)
                setCenterName(cs.center_name || '')
                setBusinessNumber(cs.business_number || '')
                setRepName(cs.representative_name || '')
                setPhoneNumber(cs.phone_number || '')
                setBaseFee(cs.base_fee?.toString() || '55000')
                setExtraFee(cs.extra_fee_per_10min?.toString() || '10000')
            }

            // Fetch Rooms
            const { data: r } = await supabase.from('rooms').select('*').order('created_at')
            if (r) setRooms(r)
        } catch (e) {
            console.error(e)
        }
    }

    // --- Center Settings ---
    const saveCenterSettings = async () => {
        const payload = {
            center_name: centerName,
            business_number: businessNumber,
            representative_name: repName,
            phone_number: phoneNumber,
            base_fee: parseInt(baseFee) || 0,
            extra_fee_per_10min: parseInt(extraFee) || 0
        }

        if (centerSettings.id) {
            // Update
            const { error } = await supabase.from('center_settings').update(payload).eq('id', centerSettings.id)
            if (error) toast.error('실패: ' + error.message)
            else toast.success('센터 정보 저장 완료')
        } else {
            // Insert
            const { error } = await supabase.from('center_settings').insert(payload)
            if (error) toast.error('실패: ' + error.message)
            else {
                toast.success('센터 정보 저장 완료')
                fetchData()
            }
        }
    }



    // --- Rooms ---
    const addRoom = async () => {
        if (!newRoomName) return
        const { error } = await supabase.from('rooms').insert({ name: newRoomName })
        if (error) toast.error('실패: ' + error.message)
        else {
            toast.success('강의실 추가 완료')
            setNewRoomName('')
            fetchData()
        }
    }

    const deleteRoom = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return
        await supabase.from('rooms').delete().eq('id', id)
        fetchData()
    }

    // --- Teachers ---
    const addTeacher = async () => {
        if (!newTeacherName) return
        const { error } = await supabase.from('teachers').insert({
            name: newTeacherName,
            birth_date: newTeacherBirthDate || null,
            phone_number: newTeacherPhone || null,
            commission_rate: parseFloat(newTeacherRate) || 0
        })
        if (error) toast.error('실패: ' + error.message)
        else {
            toast.success('선생님 추가 완료')
            resetTeacherForm()
            fetchData()
        }
    }

    const updateTeacher = async () => {
        if (!editingTeacherId || !newTeacherName) return
        const { error } = await supabase.from('teachers').update({
            name: newTeacherName,
            birth_date: newTeacherBirthDate || null,
            phone_number: newTeacherPhone || null,
            commission_rate: parseFloat(newTeacherRate) || 0
        }).eq('id', editingTeacherId)

        if (error) toast.error('수정 실패: ' + error.message)
        else {
            toast.success('선생님 정보 수정 완료')
            resetTeacherForm()
            fetchData()
        }
    }

    const startEditTeacher = (t: any) => {
        setEditingTeacherId(t.id)
        setNewTeacherName(t.name)
        setNewTeacherBirthDate(t.birth_date || '')
        setNewTeacherPhone(t.phone_number || '')
        setNewTeacherRate(t.commission_rate?.toString() || '')
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const resetTeacherForm = () => {
        setEditingTeacherId(null)
        setNewTeacherName('')
        setNewTeacherBirthDate('')
        setNewTeacherPhone('')
        setNewTeacherRate('')
    }

    const deleteTeacher = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return
        await supabase.from('teachers').delete().eq('id', id)
        fetchData()
    }

    // ... (Assignment logic unchanged) ...
    const openStudentManagement = async (teacherId: string) => {
        setManagingTeacherId(teacherId)
        const initialSelections: Record<string, boolean> = {}
        clients.forEach(c => initialSelections[c.id] = false)
        const { data: assignments } = await supabase.from('teacher_clients').select('client_id').eq('teacher_id', teacherId)
        if (assignments) {
            assignments.forEach((a: any) => initialSelections[a.client_id] = true)
        }
        setTeacherStudentSelections(initialSelections)
    }

    const saveTeacherStudents = async () => {
        if (!managingTeacherId) return
        const selectedClientIds = Object.entries(teacherStudentSelections)
            .filter(([_, selected]) => selected)
            .map(([clientId]) => clientId)
        await supabase.from('teacher_clients').delete().eq('teacher_id', managingTeacherId)
        if (selectedClientIds.length > 0) {
            const toInsert = selectedClientIds.map(clientId => ({
                teacher_id: managingTeacherId,
                client_id: clientId
            }))
            const { error } = await supabase.from('teacher_clients').insert(toInsert)
            if (error) toast.error('저장 실패: ' + error.message)
            else toast.success('담당 학생 저장 완료')
        } else {
            toast.success('담당 학생 저장 완료 (없음)')
        }
        setManagingTeacherId(null)
    }





    // --- Clients ---
    const handleVoucherCheck = (voucherId: string, checked: boolean) => {
        setClientVoucherSelections(prev => ({
            ...prev,
            [voucherId]: { ...prev[voucherId], selected: checked }
        }))
    }

    const handleVoucherInfoChange = (voucherId: string, field: 'count' | 'burden', value: string) => {
        setClientVoucherSelections(prev => ({
            ...prev,
            [voucherId]: { ...prev[voucherId], [field]: value }
        }))
    }

    const addClient = async () => {
        if (!newClientName) return

        const { data: newClient, error: clientError } = await supabase.from('clients').insert({
            name: newClientName,
            birth_date: newClientBirthDate || null,
            phone_number: newClientPhone || null
        }).select().single()

        if (clientError) {
            toast.error('실패: ' + clientError.message)
            return
        }

        await saveClientVouchers(newClient.id)
        toast.success('내담자 추가 완료')
        resetClientForm()
        fetchData()
    }

    const updateClient = async () => {
        if (!editingClientId || !newClientName) return

        const { error: clientError } = await supabase.from('clients').update({
            name: newClientName,
            birth_date: newClientBirthDate || null,
            phone_number: newClientPhone || null
        }).eq('id', editingClientId)

        if (clientError) {
            toast.error('수정 실패: ' + clientError.message)
            return
        }

        // Delete existing vouchers and re-add
        await supabase.from('client_vouchers').delete().eq('client_id', editingClientId)
        await saveClientVouchers(editingClientId)

        toast.success('내담자 정보 수정 완료')
        resetClientForm()
        fetchData()
    }

    const saveClientVouchers = async (clientId: string) => {
        const vouchersToInsert = Object.entries(clientVoucherSelections)
            .filter(([_, val]) => val.selected)
            .map(([voucherId, val]) => ({
                client_id: clientId,
                voucher_id: voucherId,
                monthly_session_count: parseInt(val.count) || 4,
                monthly_personal_burden: parseInt(val.burden) || 0,
                copay: 0 // Legacy
            }))

        if (vouchersToInsert.length > 0) {
            const { error: voucherError } = await supabase.from('client_vouchers').insert(vouchersToInsert)
            if (voucherError) toast.error('바우처 저장 실패: ' + voucherError.message)
        }
    }

    const startEditClient = (c: any) => {
        setEditingClientId(c.id)
        setNewClientName(c.name)
        setNewClientBirthDate(c.birth_date || '')
        setNewClientPhone(c.phone_number || '')

        // Populate vouchers
        const selections: Record<string, { selected: boolean, count: string, burden: string }> = {}
        vouchers.forEach(v => {
            const cv = c.client_vouchers?.find((item: any) => item.voucher_id === v.id)
            if (cv) {
                selections[v.id] = {
                    selected: true,
                    count: cv.monthly_session_count?.toString() || '4',
                    burden: cv.monthly_personal_burden?.toString() || '0'
                }
            } else {
                selections[v.id] = { selected: false, count: '4', burden: '0' }
            }
        })
        setClientVoucherSelections(selections)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const resetClientForm = () => {
        setEditingClientId(null)
        setNewClientName('')
        setNewClientBirthDate('')
        setNewClientPhone('')

        const initialSelections: Record<string, { selected: boolean, count: string, burden: string }> = {}
        vouchers.forEach(voucher => {
            initialSelections[voucher.id] = { selected: false, count: '4', burden: '0' }
        })
        setClientVoucherSelections(initialSelections)
    }

    const deleteClient = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return
        await supabase.from('clients').delete().eq('id', id)
        fetchData()
    }

    return (
        <div className="p-4 pb-24 space-y-4">
            <h1 className="text-2xl font-bold mb-4">설정</h1>

            <Tabs defaultValue="center">
                <TabsList className="w-full">
                    <TabsTrigger value="center">센터</TabsTrigger>
                    <TabsTrigger value="teachers">선생님</TabsTrigger>
                    <TabsTrigger value="vouchers">바우처</TabsTrigger>
                    <TabsTrigger value="clients">내담자</TabsTrigger>
                </TabsList>

                {/* Center Settings Tab */}
                <TabsContent value="center" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>센터 기본 정보</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">센터명</label>
                                <Input value={centerName} onChange={e => setCenterName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">사업자등록번호</label>
                                <Input value={businessNumber} onChange={e => setBusinessNumber(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">대표자명</label>
                                <Input value={repName} onChange={e => setRepName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">대표 전화번호</label>
                                <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
                            </div>

                            <div className="border-t pt-4 mt-4">
                                <h3 className="font-semibold mb-3">수업료 설정</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">기본 수업료 (40분)</label>
                                        <Input type="number" value={baseFee} onChange={e => setBaseFee(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">추가 수업료 (10분당)</label>
                                        <Input type="number" value={extraFee} onChange={e => setExtraFee(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <Button onClick={saveCenterSettings} className="w-full mt-4">설정 저장</Button>
                        </CardContent>
                    </Card>

                    {/* Room Management */}
                    <Card>
                        <CardHeader>
                            <CardTitle>강의실(치료실) 관리</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="강의실 이름 (예: 101호, 언어치료실)"
                                    value={newRoomName}
                                    onChange={e => setNewRoomName(e.target.value)}
                                />
                                <Button onClick={addRoom}>추가</Button>
                            </div>
                            <div className="space-y-2">
                                {rooms.map(room => (
                                    <div key={room.id} className="flex justify-between items-center p-3 bg-white rounded-lg border shadow-sm">
                                        <span>{room.name}</span>
                                        <Button variant="ghost" size="icon" onClick={() => deleteRoom(room.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                ))}
                                {rooms.length === 0 && <p className="text-sm text-gray-500 text-center py-4">등록된 강의실이 없습니다.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Teachers Tab */}
                <TabsContent value="teachers" className="space-y-4">
                    <Card className={editingTeacherId ? "border-primary" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium">{editingTeacherId ? '선생님 정보 수정' : '새 선생님 등록'}</CardTitle>
                            {editingTeacherId && <Button variant="ghost" size="sm" onClick={resetTeacherForm}><X className="w-4 h-4 mr-1" />취소</Button>}
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Input placeholder="이름" value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} />
                            <Input placeholder="전화번호 (010-0000-0000)" value={newTeacherPhone} onChange={e => setNewTeacherPhone(e.target.value)} />
                            <Input placeholder="생년월일 (YYYY-MM-DD)" value={newTeacherBirthDate} onChange={e => setNewTeacherBirthDate(e.target.value)} />
                            <Input placeholder="수업비 비율 (%)" type="number" value={newTeacherRate} onChange={e => setNewTeacherRate(e.target.value)} />
                            <Button onClick={editingTeacherId ? updateTeacher : addTeacher} className="w-full" variant={editingTeacherId ? "default" : "default"}>
                                {editingTeacherId ? '수정 완료' : '추가'}
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="space-y-2">
                        {teachers.map(t => (
                            <div key={t.id} className={`p-3 bg-white rounded-lg border shadow-sm ${editingTeacherId === t.id ? 'border-primary bg-blue-50' : ''}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <div>
                                        <div className="font-medium flex items-center gap-2">
                                            {t.name}
                                            {t.birth_date && <span className="text-xs text-gray-500 font-normal">({t.birth_date})</span>}
                                        </div>
                                        <div className="text-sm text-gray-500">{t.phone_number || '-'}</div>
                                        <div className="text-sm text-gray-500">비율: {t.commission_rate}%</div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" onClick={() => startEditTeacher(t)}>
                                            <Pencil className="w-4 h-4 text-blue-500" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteTeacher(t.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" className="w-full" onClick={() => openStudentManagement(t.id)}>
                                    담당 내담자 관리
                                </Button>
                            </div>
                        ))}
                    </div>

                    {/* Teacher-Student Assignment Modal/Area */}
                    {managingTeacherId && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                            <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
                                <CardHeader>
                                    <CardTitle>담당 내담자 선택</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 mb-4">
                                        {clients.map(c => (
                                            <div key={c.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4"
                                                    checked={teacherStudentSelections[c.id] || false}
                                                    onChange={e => setTeacherStudentSelections(prev => ({ ...prev, [c.id]: e.target.checked }))}
                                                />
                                                <div className="text-sm">
                                                    {c.name}
                                                    {c.birth_date && <span className="text-xs text-gray-500 ml-1">({c.birth_date})</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button className="flex-1" onClick={saveTeacherStudents}>저장</Button>
                                        <Button variant="outline" className="flex-1" onClick={() => setManagingTeacherId(null)}>취소</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                {/* Vouchers Tab */}
                <TabsContent value="vouchers" className="space-y-4">
                    <Card className={editingVoucherId ? "border-primary" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium">{editingVoucherId ? '바우처 수정' : '새 바우처 등록'}</CardTitle>
                            {editingVoucherId && <Button variant="ghost" size="sm" onClick={resetVoucherForm}><X className="w-4 h-4 mr-1" />취소</Button>}
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Input placeholder="바우처명" value={newVoucherName} onChange={e => setNewVoucherName(e.target.value)} />
                            <Input placeholder="월 지원금액 (원)" type="number" value={newVoucherSupport} onChange={e => setNewVoucherSupport(e.target.value)} />
                            <Input placeholder="1회 차감액(지원금 기준) (원)" type="number" value={newVoucherDefaultFee} onChange={e => setNewVoucherDefaultFee(e.target.value)} />
                            <Button onClick={editingVoucherId ? updateVoucher : addVoucher} className="w-full">
                                {editingVoucherId ? '수정 완료' : '추가'}
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="space-y-2">
                        {vouchers.map(v => (
                            <div key={v.id} className={`flex justify-between items-center p-3 bg-white rounded-lg border shadow-sm ${editingVoucherId === v.id ? 'border-primary bg-blue-50' : ''}`}>
                                <div>
                                    <div className="font-medium">{v.name}</div>
                                    <div className="text-sm text-gray-500">
                                        월 {v.support_amount?.toLocaleString()}원
                                        <span className="ml-2 text-blue-600">
                                            (1회 {v.default_fee?.toLocaleString()}원 차감)
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => startEditVoucher(v)}>
                                        <Pencil className="w-4 h-4 text-blue-500" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => deleteVoucher(v.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* Clients Tab */}
                <TabsContent value="clients" className="space-y-4">
                    <Card className={editingClientId ? "border-primary" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium">{editingClientId ? '내담자 정보 수정' : '새 내담자 등록'}</CardTitle>
                            {editingClientId && <Button variant="ghost" size="sm" onClick={resetClientForm}><X className="w-4 h-4 mr-1" />취소</Button>}
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Input placeholder="이름" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                            <Input placeholder="전화번호 (010-0000-0000)" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} />
                            <Input placeholder="생년월일 (YYYY-MM-DD)" value={newClientBirthDate} onChange={e => setNewClientBirthDate(e.target.value)} />

                            <div className="space-y-2 pt-2">
                                <p className="text-sm font-medium text-gray-700">이용 바우처 선택</p>
                                {vouchers.map(v => (
                                    <div key={v.id} className="flex items-center space-x-2 p-2 border rounded-md">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4"
                                            checked={clientVoucherSelections[v.id]?.selected || false}
                                            onChange={e => handleVoucherCheck(v.id, e.target.checked)}
                                        />
                                        <div className="flex-1 text-sm">
                                            <span>{v.name}</span>
                                        </div>
                                        {clientVoucherSelections[v.id]?.selected && (
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={clientVoucherSelections[v.id]?.count?.toString()}
                                                    onValueChange={val => handleVoucherInfoChange(v.id, 'count', val)}
                                                >
                                                    <SelectTrigger className="w-20 h-8 text-xs">
                                                        <SelectValue placeholder="횟수" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {[1, 2, 3, 4, 5].map(num => (
                                                            <SelectItem key={num} value={num.toString()}>{num}회</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Input
                                                    placeholder="월 본인부담금"
                                                    type="number"
                                                    className="w-28 h-8 text-sm"
                                                    value={clientVoucherSelections[v.id]?.burden}
                                                    onChange={e => handleVoucherInfoChange(v.id, 'burden', e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <Button onClick={editingClientId ? updateClient : addClient} className="w-full mt-4">
                                {editingClientId ? '수정 완료' : '추가'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Filter UI */}
                    <div className="flex gap-2 mb-2 items-center bg-gray-50 p-2 rounded-md border">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                            <Input
                                placeholder="이름 검색"
                                className="pl-8 bg-white"
                                value={clientSearchQuery}
                                onChange={e => setClientSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={clientVoucherFilter} onValueChange={setClientVoucherFilter}>
                            <SelectTrigger className="w-[140px] bg-white">
                                <SelectValue placeholder="바우처 필터" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체 보기</SelectItem>
                                {vouchers.map(v => (
                                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        {filteredClients.map(c => (
                            <div key={c.id} className={`p-3 bg-white rounded-lg border shadow-sm ${editingClientId === c.id ? 'border-primary bg-blue-50' : ''}`}>
                                <div className="flex justify-between items-center">
                                    <div className="font-medium flex items-center gap-2">
                                        {c.name}
                                        {c.birth_date && <span className="text-xs text-gray-500 font-normal">({c.birth_date})</span>}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500">{c.phone_number || '-'}</div>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <Button variant="ghost" size="icon" onClick={() => startEditClient(c)}>
                                            <Pencil className="w-4 h-4 text-blue-500" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteClient(c.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                                {c.client_vouchers && c.client_vouchers.length > 0 && (
                                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                                        {c.client_vouchers.map((cv: any) => (
                                            <div key={cv.voucher_id} className="flex justify-between">
                                                <span>{cv.vouchers?.name}</span>
                                                <span>월 {cv.monthly_session_count}회 / 부담금: {cv.monthly_personal_burden?.toLocaleString()}원</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {filteredClients.length === 0 && (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                검색 결과가 없습니다.
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
