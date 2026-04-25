import { router, usePage } from '@inertiajs/react'
import { MeetingDetailPanel } from './MeetingDetailPanel'

type PageProps = {
  meeting: Parameters<typeof MeetingDetailPanel>[0]['meeting']
}

export default function MeetingDetailView() {
  const { meeting } = usePage<PageProps>().props

  return (
    <MeetingDetailPanel
      meeting={meeting}
      onClose={() => router.visit('/meetings')}
      onUpdate={() => router.reload({ only: ['meeting'] })}
    />
  )
}
