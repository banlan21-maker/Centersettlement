'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PlusCircle, Settings, FileBarChart } from 'lucide-react'

export default function Home() {
  const [centerName, setCenterName] = useState('센터')
  const supabase = createClient()

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('center_settings').select('center_name').single()
      if (data && data.center_name) {
        setCenterName(data.center_name)
      }
    }
    fetchSettings()
  }, [])

  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="flex flex-col space-y-2 mt-8 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">{centerName} 관리자님, <br />환영합니다 👋</h1>
        <p className="text-muted-foreground">오늘도 원활한 센터 운영을 도와드릴게요.</p>
      </div>

      <div className="grid gap-4">
        {/* Quick Action: Record */}
        <Link href="/record">
          <Card className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <PlusCircle className="mr-2 h-6 w-6" />
                수업 기록하기
              </CardTitle>
              <CardDescription className="text-primary-foreground/80">
                오늘 진행한 수업을 바로 입력하세요.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Quick Action: Report */}
        <Link href="/report">
          <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileBarChart className="mr-2 h-5 w-5 text-blue-600" />
                정산 리포트 확인
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>

        {/* Quick Action: Settings */}
        <Link href="/settings">
          <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="mr-2 h-5 w-5 text-gray-600" />
                기초 데이터 관리
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="mt-8 p-4 bg-slate-100 rounded-lg text-sm text-gray-500">
        <p>💡 Tip: 수업료 및 센터 정보는 [기초 데이터 관리] 메뉴에서 언제든지 수정할 수 있습니다.</p>
      </div>

      <div className="mt-8 text-center text-xs text-gray-400 space-y-1">
        <p>v1.04</p>
        <p>by.banlan</p>
      </div>
    </div>
  )
}
