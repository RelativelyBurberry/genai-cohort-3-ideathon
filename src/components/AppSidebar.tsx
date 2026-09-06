import React from 'react';
import { Home, BookOpen, Sparkles, TrendingUp, Orbit, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import { useDemo, useIsDemoSession } from '../demo';

export type AppView =
  | 'home'
  | 'journal'
  | 'reflection'
  | 'patternshift'
  | 'constellation'
  | 'settings'
  | 'admin';

interface AppSidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ activeView, onViewChange }) => {
  const { user, signOutUser } = useAuth();
  const { isDemoSession, demoUser, exitDemoSession } = useDemo();
  const { isAdmin } = useRole();
  const isDemo = useIsDemoSession();

  const firstName = isDemo
    ? (demoUser?.displayName.split(' ')[0] || 'Reflector')
    : (user?.displayName ? user.displayName.split(' ')[0] : 'Reflector');
  const userInitial = firstName.charAt(0).toUpperCase();
  
  const photoURL = isDemo ? null : user?.photoURL;

  const handleSignOut = async () => {
    if (isDemo) {
      exitDemoSession();
    } else {
      await signOutUser();
    }
  };

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Primary navigation">
      {/* Brand */}
      <div className="sidebar-brand">
        <span className="brand-dot" aria-hidden="true" />
        <span className="brand-text">reflectra</span>
      </div>

      {/* User Profile */}
      <div className="sidebar-profile">
        {photoURL ? (
          <img
            src={photoURL}
            alt={user?.displayName || 'User'}
            className="sidebar-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="sidebar-avatar avatar-fallback" aria-hidden="true">
            {userInitial}
          </div>
        )}
        <div className="profile-info">
          <strong className="profile-name">{firstName}</strong>
          <small className="profile-label">
            {isDemo ? 'Demo workspace' : 'Personal space'}
          </small>
        </div>
      </div>

      {/* Demo Mode Indicator */}
      {isDemo && (
        <div className="demo-mode-indicator" role="status" aria-label="Demo mode active">
          <span className="demo-mode-dot" aria-hidden="true">◉</span>
          <span className="demo-mode-text">Preview mode</span>
        </div>
      )}

      {/* Primary Navigation */}
      <nav className="sidebar-nav">
        <NavItem
          icon={<Home className="nav-icon-svg" />}
          label="Home"
          active={activeView === 'home'}
          onClick={() => onViewChange('home')}
        />
        <NavItem
          icon={<BookOpen className="nav-icon-svg" />}
          label="My Journal"
          active={activeView === 'journal'}
          onClick={() => onViewChange('journal')}
        />
        <NavItem
          icon={<Sparkles className="nav-icon-svg" />}
          label="Guided Reflection"
          active={activeView === 'reflection'}
          onClick={() => onViewChange('reflection')}
        />
        <NavItem
          icon={<TrendingUp className="nav-icon-svg" />}
          label="PatternShift"
          active={activeView === 'patternshift'}
          onClick={() => onViewChange('patternshift')}
        />
        <NavItem
          icon={<Orbit className="nav-icon-svg" />}
          label="Mood Constellation"
          active={activeView === 'constellation'}
          onClick={() => onViewChange('constellation')}
        />
      </nav>

      {/* Bottom Section */}
      <div className="sidebar-bottom">
        <NavItem
          icon={<ShieldCheck className="nav-icon-svg" />}
          label={isAdmin ? 'Admin Console' : 'Admin Console (Restricted)'}
          active={activeView === 'admin'}
          onClick={() => onViewChange('admin')}
        />
        <NavItem
          icon={<Settings className="nav-icon-svg" />}
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onViewChange('settings')}
        />
        <button
          type="button"
          className="nav-item nav-item-signout"
          onClick={handleSignOut}
          aria-label="Sign out"
        >
          <LogOut className="nav-icon-svg" />
          <span>Sign out</span>
        </button>
        <div className="sidebar-note" aria-hidden="true">
          A little more clarity,
          <br />
          one day at a time.
        </div>
      </div>
    </aside>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    className={`nav-item ${active ? 'nav-item-active' : ''}`}
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
  >
    <span className="nav-icon" aria-hidden="true">
      {icon}
    </span>
    <span className="nav-label">{label}</span>
  </button>
);
