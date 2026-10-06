import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { PageHeader } from '@/ui'
import { AppearanceCard } from '../cards/AppearanceCard'
import { BackgroundCard } from '../cards/BackgroundCard'
import { BadgeCard } from '../cards/BadgeCard'
import { InstallCard } from '../cards/InstallCard'
import { NotificationsCard } from '../cards/NotificationsCard'
import { OperatorCard } from '../cards/OperatorCard'
import { StorageCard } from '../cards/StorageCard'
import { UpdatesCard } from '../cards/UpdatesCard'
import { SECTIONS, SettingsNav, type SectionId } from '../SettingsNav'
import styles from './SettingsPage.module.css'

const isSection = (id: string): id is SectionId => SECTIONS.some((s) => s.id === id)

/** Follows the hash: scrolls to the named card on arrival and whenever a nav link changes it. */
function useHashScroll(): void {
  const { hash } = useLocation()
  useEffect(() => {
    const id = hash.slice(1)
    if (!isSection(id)) return
    // The shell moves focus to the page heading in the frame after a route change; scroll after that.
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 120)
    return () => clearTimeout(timer)
  }, [hash])
}

/** The card nearest the top of the viewport. Read-only observer; it only colours the local nav. */
function useCurrentSection(): SectionId {
  const { hash } = useLocation()
  const [current, setCurrent] = useState<SectionId>('operator')
  useEffect(() => {
    // The last cards cannot scroll far enough to reach the observer's zone, so a clicked link names the section itself.
    const id = hash.slice(1)
    if (isSection(id)) setCurrent(id)
  }, [hash])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Set<SectionId>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (!isSection(id)) continue
          if (entry.isIntersecting) visible.add(id)
          else visible.delete(id)
        }
        const first = SECTIONS.find((s) => visible.has(s.id))
        if (first) setCurrent(first.id)
      },
      { rootMargin: '-96px 0px -55% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])
  return current
}

export default function SettingsPage() {
  useHashScroll()
  const current = useCurrentSection()
  return (
    <>
      <PageHeader
        eyebrow="Register / Station settings"
        title="Settings"
        description="Who is on shift, how the page looks, and every switch that leans on the PWA files. A card that depends on a stub says so and does nothing else."
      />
      <div className={styles.layout}>
        <SettingsNav current={current} />
        <div className={styles.column}>
          <OperatorCard />
          <AppearanceCard />
          <NotificationsCard />
          <InstallCard />
          <UpdatesCard />
          <BackgroundCard />
          <BadgeCard />
          <StorageCard />
        </div>
      </div>
    </>
  )
}
