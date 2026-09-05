import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useDemo, useIsDemoSession } from '../demo';

/**
 * SettingsView - Placeholder for future settings implementation
 * 
 * This component establishes the view boundary and shell integration.
 * Future phases will implement:
 * - Profile management
 * - Reminder/scheduling preferences
 * - Appearance customization
 * - Privacy controls
 * - Export/data management
 * 
 * For now, displays a polished placeholder with clear navigation structure.
 */

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const { isDemoSession, demoUser, resetDemoWorkspace } = useDemo();
  const isDemo = useIsDemoSession();
  
  const firstName = isDemo
    ? (demoUser?.displayName.split(' ')[0] || 'Reflector')
    : (user?.displayName ? user.displayName.split(' ')[0] : 'Reflector');
  const userEmail = isDemo 
    ? (demoUser?.email || 'Not available')
    : (user?.email || 'Not available');

  const settingsItems = [
    {
      label: 'Profile',
      value: firstName,
      icon: '↗',
      description: 'Manage your account details',
    },
    {
      label: 'Reminders',
      value: 'Not configured',
      icon: '›',
      description: 'Set daily reflection reminders',
    },
    {
      label: 'Appearance',
      value: 'Warm light',
      icon: '›',
      description: 'Customize your reflection space',
    },
    {
      label: 'Privacy',
      value: 'Your journal is private',
      icon: '›',
      description: 'Control your data and sharing',
    },
  ];

  return (
    <div className="settings-view">
      <div className="page-wrap narrow">
        {/* Page Header */}
        <div className="page-heading">
          <p className="eyebrow">Make it yours</p>
          <h1>
            Your <em>Settings</em>
          </h1>
          <p>Shape the space around your practice.</p>
        </div>

        {/* Demo Workspace Notice */}
        {isDemo && (
          <div className="demo-workspace-notice">
            <div className="demo-workspace-notice-title">
              <span className="demo-dot">◉</span>
              <span>Demo Workspace</span>
            </div>
            <p className="demo-workspace-notice-text">
              This workspace contains synthetic data for exploring Reflectra's interface.
              Changes made here stay local and do not affect a real account.
              No data is sent to Firebase or the backend.
            </p>
            <div className="demo-workspace-notice-actions">
              <button
                type="button"
                className="demo-reset-button"
                onClick={resetDemoWorkspace}
              >
                Reset demo workspace
              </button>
            </div>
          </div>
        )}

        {/* Settings List */}
        <div className="settings-list" role="list">
          {settingsItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className="setting-row"
              role="listitem"
              aria-label={`${item.label}: ${item.value}`}
              disabled
            >
              <span className="setting-content">
                <strong className="setting-label">{item.label}</strong>
                <small className="setting-value">{item.value}</small>
              </span>
              <span className="setting-icon" aria-hidden="true">
                {item.icon}
              </span>
            </button>
          ))}
        </div>

        {/* Account Info */}
        <div className="settings-account-info">
          <p className="account-label">{isDemo ? 'Demo identity' : 'Signed in as'}</p>
          <p className="account-email">{userEmail}</p>
        </div>
      </div>
    </div>
  );
};
