type Tab = 'files' | 'images'

interface SidebarProps {
  isDark: boolean
  onToggleTheme: () => void
  onOpenSettings: () => void
  activeTab: Tab
  onSelectTab: (tab: Tab) => void
}

export function Sidebar({ isDark, onToggleTheme, onOpenSettings, activeTab, onSelectTab }: SidebarProps) {
  return (
    <div
      className="flex w-[68px] flex-none flex-col items-center gap-1 py-3.5 pb-3"
      style={{ background: 'var(--rail)', borderRight: '1px solid var(--line)' }}
    >
      <button
        onClick={() => onSelectTab('files')}
        className="flex w-[52px] cursor-pointer flex-col items-center gap-1.5 rounded-[7px] py-2 pb-[7px]"
        style={
          activeTab === 'files'
            ? { background: 'var(--rail-active)', boxShadow: 'inset 0 0 0 1px var(--rail-active-line)' }
            : { background: 'transparent' }
        }
      >
        <div
          className="h-[15px] w-[15px] rounded-full"
          style={{ border: `1.6px solid ${activeTab === 'files' ? 'var(--accent)' : 'var(--ink3)'}` }}
        />
        <div
          className="font-mono text-[8.5px] tracking-[0.08em]"
          style={{ color: activeTab === 'files' ? 'var(--accent)' : 'var(--ink3)' }}
        >
          FILES
        </div>
      </button>

      <button
        onClick={() => onSelectTab('images')}
        className="flex w-[52px] cursor-pointer flex-col items-center gap-1.5 rounded-[7px] py-2 pb-[7px]"
        title="Near-duplicate photo review"
        style={
          activeTab === 'images'
            ? { background: 'var(--rail-active)', boxShadow: 'inset 0 0 0 1px var(--rail-active-line)' }
            : { background: 'transparent' }
        }
      >
        <div
          className="h-[15px] w-[15px] rounded-[3px]"
          style={{ border: `1.6px solid ${activeTab === 'images' ? 'var(--accent)' : 'var(--ink3)'}` }}
        />
        <div
          className="font-mono text-[8.5px] tracking-[0.08em]"
          style={{ color: activeTab === 'images' ? 'var(--accent)' : 'var(--ink3)' }}
        >
          IMAGES
        </div>
      </button>

      <div className="flex-1" />

      <button
        onClick={onToggleTheme}
        className="flex w-[52px] cursor-pointer flex-col items-center gap-1.5 rounded-[7px] py-2 pb-[7px] hover:opacity-90"
        style={{ background: 'transparent' }}
      >
        {isDark ? (
          <div
            className="flex h-[15px] w-7 items-center justify-end rounded-full px-0.5"
            style={{ background: 'var(--accent)' }}
          >
            <div className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--on-accent)' }} />
          </div>
        ) : (
          <div
            className="flex h-[15px] w-7 items-center rounded-full px-0.5"
            style={{ background: 'var(--line2)' }}
          >
            <div className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--panel)' }} />
          </div>
        )}
        <div
          className="font-mono text-[8.5px] tracking-[0.08em]"
          style={{ color: 'var(--ink3)' }}
        >
          DARK
        </div>
      </button>

      <button
        onClick={onOpenSettings}
        className="flex w-[52px] cursor-pointer flex-col items-center gap-1.5 rounded-[7px] py-2 pb-[7px] hover:opacity-90"
        style={{ background: 'transparent' }}
      >
        <div
          className="h-[15px] w-[15px] rounded-full"
          style={{ border: '1.6px solid var(--ink3)' }}
        />
        <div
          className="font-mono text-[8.5px] tracking-[0.08em]"
          style={{ color: 'var(--ink3)' }}
        >
          SETTINGS
        </div>
      </button>
    </div>
  )
}
