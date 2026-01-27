'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, PlusCircle, FileText, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function BottomNav() {
    const pathname = usePathname()

    const navItems = [
        { href: '/', label: '홈', icon: Home },
        { href: '/record', label: '수업입력', icon: PlusCircle },
        { href: '/report', label: '정산', icon: FileText },
        { href: '/settings', label: '설정', icon: Settings },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 border-t bg-background pb-safe z-50">
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <Icon className="w-6 h-6" />
                            <span className="text-xs font-medium">{item.label}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
