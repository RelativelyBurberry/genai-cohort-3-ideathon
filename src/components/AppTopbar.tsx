import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { AppView } from './AppSidebar';

interface AppTopbarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

/**
 * AppTopbar - Mobile navigation topbar
 * 
 * Displays on mobile/tablet viewports (<620px) with:
 * - Brand mark
 * - Hamburger menu toggle
 * - Mobile navigation drawer
 */
export const AppTopbar: React.FC<AppTopbarProps> = ({ activeView, onViewChange }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleViewChange = (view: AppView) => {
    onViewChange(view);
    setIsMenuOpen(false);
  };

  return (
    <>
      <header className="app-topbar">
        <div className="mobile-brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-text">reflectra</span>
        </div>
        <button
          type="button"
          className="topbar-menu-button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav-drawer"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {isMenuOpen ? (
            <X className="menu-icon" aria-hidden="true" />
          ) : (
            <Menu className="menu-icon" aria-hidden="true" />
          )}
        </button>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMenuOpen && (
        <div
          id="mobile-nav-drawer"
          className="mobile-nav-drawer"
          role="navigation"
          aria-label="Mobile navigation"
        >
          <nav className="mobile-nav-list">
            <MobileNavItem
              label="Home"
              active={activeView === 'home'}
              onClick={() => handleViewChange('home')}
            />
            <MobileNavItem
              label="My Journal"
              active={activeView === 'journal'}
              onClick={() => handleViewChange('journal')}
            />
            <MobileNavItem
              label="Guided Reflection"
              active={activeView === 'reflection'}
              onClick={() => handleViewChange('reflection')}
            />
            <MobileNavItem
              label="PatternShift"
              active={activeView === 'patternshift'}
              onClick={() => handleViewChange('patternshift')}
            />
            <MobileNavItem
              label="Admin Console"
              active={activeView === 'admin'}
              onClick={() => handleViewChange('admin')}
            />
            <MobileNavItem
              label="Settings"
              active={activeView === 'settings'}
              onClick={() => handleViewChange('settings')}
            />
          </nav>
        </div>
      )}
    </>
  );
};

interface MobileNavItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const MobileNavItem: React.FC<MobileNavItemProps> = ({ label, active, onClick }) => (
  <button
    type="button"
    className={`mobile-nav-item ${active ? 'mobile-nav-item-active' : ''}`}
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
  >
    {label}
  </button>
);
