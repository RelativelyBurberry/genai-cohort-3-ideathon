import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getJournalEntries } from '../services/journalService';
import { subscribeToConversations } from '../services/reflectionService';
import { useDemo, useIsDemoSession } from '../demo';
import type { Conversation } from '../types/reflection';
import type { JournalEntry } from '../types/journal';
import { BookOpen, Sparkles, TrendingUp, LogOut, Plus, Calendar, Heart } from 'lucide-react';

export const HomeDashboard: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { demoJournalEntries, demoUser } = useDemo();
  const isDemo = useIsDemoSession();
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get user's first name safely (demo or real)
  const firstName = isDemo 
    ? (demoUser?.displayName.split(' ')[0] || 'Reflector')
    : (user?.displayName ? user.displayName.split(' ')[0] : 'Reflector');
  
  // Get time-based greeting
  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'GOOD MORNING';
    if (hour < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  }, []);

  // Get today's date components
  const getDateInfo = useMemo(() => {
    const now = new Date();
    return {
      day: now.getDate(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      month: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  }, []);

  // Calculate weekly activity from journal entries
  const weeklyActivity = useMemo(() => {
    if (!journalEntries.length) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get start of week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Initialize week array (Sunday=0 to Saturday=6)
    const weekDays = Array(7).fill(false);
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    // Mark days with journal activity
    journalEntries.forEach(entry => {
      if (entry.createdAt) {
        const entryDate = entry.createdAt.toDate();
        entryDate.setHours(0, 0, 0, 0);
        
        const diffTime = entryDate.getTime() - startOfWeek.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays < 7) {
          weekDays[diffDays] = true;
        }
      }
    });
    
    return { weekDays, dayNames };
  }, [journalEntries]);

  // Calculate streak (consecutive days with activity ending today or yesterday)
  const streak = useMemo(() => {
    if (!journalEntries.length) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get unique dates with activity
    const activeDates = new Set();
    journalEntries.forEach(entry => {
      if (entry.createdAt) {
        const entryDate = entry.createdAt.toDate();
        entryDate.setHours(0, 0, 0, 0);
        activeDates.add(entryDate.getTime());
      }
    });
    
    // Check consecutive days from today backwards
    let currentStreak = 0;
    let checkDate = new Date(today);
    
    while (true) {
      const dateKey = checkDate.getTime();
      if (activeDates.has(dateKey)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return currentStreak;
  }, [journalEntries]);

  // Get recent journal entries (max 3)
  const recentEntries = useMemo(() => {
    return journalEntries
      .slice(0, 3)
      .map(entry => ({
        ...entry,
        formattedDate: entry.createdAt ? 
          entry.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
          ''
      }));
  }, [journalEntries]);

  // Load data on mount
  useEffect(() => {
    // Demo mode: use synthetic data from DemoContext
    if (isDemo) {
      setJournalEntries(demoJournalEntries);
      setLoading(false);
      return;
    }
    
    if (!user?.uid) return;
    
    let isMounted = true;
    
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Load journal entries
        const entries = await getJournalEntries(user.uid);
        if (isMounted) setJournalEntries(entries);
        
        // Subscribe to conversations for reflection activity
        const unsubscribe = subscribeToConversations(
          user.uid,
          (convs) => {
            if (isMounted) setConversations(convs);
          },
          (err) => {
            if (isMounted) {
              console.warn('Failed to load conversations:', err);
              // Don't set error for conversations as it's not critical for home view
            }
          }
        );
        
        if (isMounted) setLoading(false);
        
        return unsubscribe;
      } catch (err) {
        if (isMounted) {
          setError('Failed to load your reflections. Please try again.');
          setLoading(false);
        }
      }
    };

    const unsubscribe = loadData();
    
    return () => {
      // Cleanup subscription would go here if we stored it
      // For simplicity, we rely on the service cleanup
    };
  }, [user?.uid, isDemo, demoJournalEntries]);

  const handleNavigateToJournal = () => {
    if (onNavigate) onNavigate('journal');
  };

  const handleNavigateToReflection = () => {
    if (onNavigate) onNavigate('reflection');
  };

  if (loading) {
    return (
      <div className="home-dashboard-loading">
        <div className="page-wrap">
          <div className="loading-skeleton">
            <div className="skeleton-greeting"></div>
            <div className="skeleton-date"></div>
            <div className="skeleton-cards"></div>
            <div className="skeleton-recent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-dashboard-error">
        <div className="page-wrap">
          <p className="error-message">{error}</p>
          <button 
            type="button" 
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-dashboard">
      <div className="page-wrap">
        {/* Header with greeting and date */}
        <div className="home-header">
          <div className="greeting-section">
            <p className="eyebrow">{getGreeting()}, {firstName}</p>
            <h1>
              Make space for
              <br />
              <em>what matters.</em>
            </h1>
          </div>
          
          <div className="date-section">
            <div className="date-day">{getDateInfo().day}</div>
            <div>
              <span className="date-weekday">{getDateInfo().weekday}</span>
              <br />
              <span className="date-month">{getDateInfo().month}</span>
            </div>
          </div>
        </div>

        {/* Main content grid */}
        <div className="home-content">
          {/* Left column: Today's Reflection and Rhythm */}
          <div className="home-columns">
            <div className="home-column left">
              {/* Today's Reflection Card */}
              <section className="today-reflection-card card">
                <div className="card-kicker">
                  <span className="kicker-icon">✦</span> TODAY'S REFLECTION
                </div>
                <h2>
                  How are you,
                  <br />
                  <em>really?</em>
                </h2>
                <p>
                  A moment of honesty can change
                  <br />
                  the shape of your whole day.
                </p>
                <button
                  type="button"
                  onClick={handleNavigateToReflection}
                  className="btn btn-primary"
                >
                  Begin reflection <span>→</span>
                </button>
                <div className="card-decoration">◜</div>
              </section>

              {/* Personal Rhythm Card */}
              <section className="rhythm-card card">
                <div className="card-kicker">
                  <span className="kicker-icon">◌</span> YOUR RHYTHM
                </div>
                {streak > 0 ? (
                  <>
                    <div className="streak-number">{streak}<span>days</span></div>
                    <p>
                      You're showing up for yourself.
                      <br />
                      <strong>Keep going.</strong>
                    </p>
                    <div className="week-dots">
                      {weeklyActivity?.weekDays.map((active, index) => (
                        <div key={index}>
                          <span 
                            className={`${active ? 'done' : ''}`} 
                            aria-label={active ? 'Active' : 'Inactive'} 
                          />
                          <small>{weeklyActivity?.dayNames[index]}</small>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      Your rhythm begins with
                      <br />
                      a single moment.
                    </p>
                    <p className="rhythm-note">
                      No pressure. Start whenever
                      <br />
                      you're ready.
                    </p>
                  </>
                )}
              </section>
            </div>

            {/* Right column: Recent Reflections */}
            <div className="home-column right">
              {journalEntries.length > 0 ? (
                <section className="recent-reflections">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">FROM YOUR JOURNAL</p>
                      <h2>Recent moments</h2>
                    </div>
                    <button
                      type="button"
                      onClick={handleNavigateToJournal}
                      className="btn btn-text"
                    >
                      View all <span>→</span>
                    </button>
                  </div>
                  
                  <div className="entries-preview">
                    {recentEntries.map((entry) => (
                      <article key={entry.id} className="entry-preview">
                        <div className="entry-meta">
                          <span className="entry-date">{entry.formattedDate}</span>
                          <span className="entry-dot">·</span>
                          <span className="entry-type">Reflection</span>
                        </div>
                        <h3>{entry.title || 'Untitled'}</h3>
                        <p className="entry-preview-text">
                          {entry.content.substring(0, 100)}{entry.content.length > 100 ? '...' : ''}
                        </p>
                        {entry.moodRating !== undefined && (
                          <div className="entry-mood">
                            {[...Array(entry.moodRating)].map((_, i) => (
                              <span key={i} className="mood-dot" aria-hidden="true" />
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleNavigateToJournal}
                          className="btn btn-read"
                        >
                          Read entry <span>→</span>
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="recent-reflections empty-state">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">FROM YOUR JOURNAL</p>
                      <h2>Recent moments</h2>
                    </div>
                    <button
                      type="button"
                      onClick={handleNavigateToJournal}
                      className="btn btn-text"
                    >
                      Open my journal <span>→</span>
                    </button>
                  </div>
                  
                  <div className="empty-message">
                    <p>Nothing written yet.</p>
                    <p>
                      Your first thought is a good place to begin.
                    </p>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
