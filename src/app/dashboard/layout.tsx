import { BottomNav } from '@/components/ui/BottomNav'

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div className="flex min-h-full flex-col pb-16">
      {children}
      <BottomNav />
    </div>
  )
}
