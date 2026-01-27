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

    // ... (Vouchers State unchanged) ...

    // Clients State
    const [clients, setClients] = useState<any[]>([])
    const [filteredClients, setFilteredClients] = useState<any[]>([]) // Displayed clients
    const [newClientName, setNewClientName] = useState('')
    const [newClientBirthDate, setNewClientBirthDate] = useState('')
    const [newClientPhone, setNewClientPhone] = useState('')
    const [clientVoucherSelections, setClientVoucherSelections] = useState<Record<string, { selected: boolean, copay: string }>>({})
    const [editingClientId, setEditingClientId] = useState<string | null>(null)

    // ... (Filter & Center Settings State unchanged) ...

    // ... (useEffect & fetchData unchanged) ...

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

    // ... (deleteTeacher, Assignment logic unchanged) ...

    // ... (Voucher logic unchanged) ...

    // --- Clients ---
    // ... (handleVoucherCheck unchanged) ...

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

    // ... (saveClientVouchers unchanged) ...

    const startEditClient = (c: any) => {
        setEditingClientId(c.id)
        setNewClientName(c.name)
        setNewClientBirthDate(c.birth_date || '')
        setNewClientPhone(c.phone_number || '')

        // Populate vouchers
        const selections: Record<string, { selected: boolean, copay: string }> = {}
        vouchers.forEach(v => {
            const cv = c.client_vouchers?.find((item: any) => item.voucher_id === v.id)
            if (cv) {
                selections[v.id] = { selected: true, copay: cv.copay?.toString() || '0' }
            } else {
                selections[v.id] = { selected: false, copay: '0' }
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

        const initialSelections: Record<string, { selected: boolean, copay: string }> = {}
        vouchers.forEach(voucher => {
            initialSelections[voucher.id] = { selected: false, copay: '0' }
        })
        setClientVoucherSelections(initialSelections)
    }

    // ... (deleteClient unchanged) ...


    return (
        <div className="p-4 pb-24 space-y-4">
            {/* ... (Center Tab unchanged) ... */}

            <Tabs defaultValue="center">
                <TabsList className="w-full">
                    <TabsTrigger value="center">센터</TabsTrigger>
                    <TabsTrigger value="teachers">선생님</TabsTrigger>
                    <TabsTrigger value="vouchers">바우처</TabsTrigger>
                    <TabsTrigger value="clients">내담자</TabsTrigger>
                </TabsList>

                <TabsContent value="center" className="space-y-4">
                    {/* ... (Center Content unchanged - copied manually to be safe or assuming merge) ... */}
                    {/* Actually, I am replacing the whole logical block above, but for the JSX part, I need to look at line numbers carefully. */}
                    {/* The `ReplacementContent` above covers logic. I will split this into two `replace_file_content` calls safely. */}
                    {/* WAIT: The instruction says "Update UI to inputs". I should do logic AND UI. */}
                    {/* The previous block was too big for one go if I want to be safe with line numbers. */}
                    {/* I'll restart the replacement to be safer - separating State/Logic update from Render update. */}
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

                    {/* Teacher-Student Assignment Modal (unchanged) */}
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

                {/* Vouchers Tab (unchanged) */}
                <TabsContent value="vouchers" className="space-y-4">
                    <Card className={editingVoucherId ? "border-primary" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium">{editingVoucherId ? '바우처 수정' : '새 바우처 등록'}</CardTitle>
                            {editingVoucherId && <Button variant="ghost" size="sm" onClick={resetVoucherForm}><X className="w-4 h-4 mr-1" />취소</Button>}
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Input placeholder="바우처명" value={newVoucherName} onChange={e => setNewVoucherName(e.target.value)} />
                            <Input placeholder="지원금액 (원)" type="number" value={newVoucherSupport} onChange={e => setNewVoucherSupport(e.target.value)} />
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
                                    <div className="text-sm text-gray-500">지원: {v.support_amount?.toLocaleString()}원</div>
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
                                            <Input
                                                placeholder="본인부담금"
                                                type="number"
                                                className="w-24 h-8 text-sm"
                                                value={clientVoucherSelections[v.id]?.copay}
                                                onChange={e => handleVoucherCopayChange(v.id, e.target.value)}
                                            />
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
                                                <span>• {cv.vouchers?.name}</span>
                                                <span>부담금: {cv.copay?.toLocaleString()}원</span>
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
