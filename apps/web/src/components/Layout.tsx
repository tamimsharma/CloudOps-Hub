// Application shell: sidebar navigation, topbar and routed content.
import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  badgeKey?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: '◎' }],
  },
  {
    title: 'Infrastructure',
    items: [
      { to: '/resources', label: 'Resources', icon: '▣' },
      { to: '/containers', label: 'Containers', icon: '▤' },
      { to: '/kubernetes', label: 'Kubernetes', icon: '⎈' },
      { to: '/deployments', label: 'Deployments', icon: '⇪' },
    ],
  },
  {
    title: 'Observability',
    items: [
      { to: '/monitoring', label: 'Monitoring', icon: '◔' },
      { to: '/logs', label: 'Logs', icon: '≡' },
      { to: '/alerts', label: 'Alerts', icon: '⚠', badgeKey: 'alerts' },
      { to: '/incidents', label: 'Incidents', icon: '⚑', badgeKey: 'incidents' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/costs', label: 'Costs', icon: '◈' },
      { to: '/reports', label: 'Reports', icon: '❐' },
      { to: '/cicd', label: 'CI/CD', icon: '⇅' },
      { to: '/aws', label: 'AWS', icon: '☁' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/profile', label: 'Profile', icon: '◐' },
      { to: '/health', label: 'Health', icon: '♥' },
      { to: '/users', label: 'Users', icon: '◍' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/resources': 'Resource Inventory',
  '/containers': 'Containers',
  '/kubernetes': 'Kubernetes',
  '/deployments': 'Deployments',
  '/monitoring': 'Monitoring',
  '/logs': 'Log Explorer',
  '/alerts': 'Alerts',
  '/incidents': 'Incidents',
  '/costs': 'Cost Management',
  '/reports': 'Reports',
  '/cicd': 'CI/CD Pipelines',
  '/aws': 'AWS Account',
  '/health': 'System Health',
  '/users': 'Users & Roles',
  '/profile': 'My Profile',
};

export function Layout({
  children,
  badges = {},
}: {
  children: ReactNode;
  badges?: Partial<Record<'alerts' | 'incidents', number>>;
}) {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const title = TITLES[location.pathname] ?? 'CloudOps Hub';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CH</div>
          <div>
            <div className="brand-title">CloudOps Hub</div>
            <div className="brand-subtitle">Operations</div>
          </div>
        </div>

        <nav>
          {NAV.map((group) => (
            <div key={group.title}>
              <div className="nav-section">{group.title}</div>
              {group.items.map((item) => {
                if (item.to === '/users' && !hasRole('ADMIN', 'ENGINEER')) return null;
                const count = item.badgeKey ? badges[item.badgeKey as 'alerts' | 'incidents'] : undefined;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    {count ? <span className="nav-badge">{count}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }} className="small faint">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', opacity: 0.8 }} />
          Demo mode · simulated
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-spacer" />
          <div className="row" style={{ gap: 14 }}>
            <div className="live-indicator">
              <span className="live-dot" />
              <span>Live Sync</span>
            </div>
            {user && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div className="small faint">{user.role}</div>
              </div>
            )}
            <button className="btn ghost sm" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          <div key={location.pathname} className="page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
