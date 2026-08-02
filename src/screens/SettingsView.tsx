import { useState } from 'react'

type Tab = 'account' | 'security' | 'devices' | 'bridge' | 'storage' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account & Keys' },
  { id: 'security', label: 'Security & Privacy' },
  { id: 'devices', label: 'Devices' },
  { id: 'bridge', label: 'Bridge Network' },
  { id: 'storage', label: 'Data & Storage' },
  { id: 'about', label: 'About' },
]

function SettingsView() {
  const [tab, setTab] = useState<Tab>('account')

  return (
    <div className="screen-pane">
      <h1>Settings</h1>
      <div className="tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted">{tab} settings will appear here.</p>
    </div>
  )
}

export default SettingsView
