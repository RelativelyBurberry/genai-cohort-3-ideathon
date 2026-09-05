import { Timestamp } from 'firebase/firestore';
import type { JournalEntry } from '../types/journal';
import type { Conversation, ReflectionMessage } from '../types/reflection';
import type { PatternShiftInsight } from '../types/patternshift';

/**
 * Demo Fixture Data
 * 
 * Realistic synthetic data for local UI preview.
 * All entries are clearly fictional and never overlap with real user data.
 */

// Helper to create timestamps relative to today
function daysAgo(n: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() - n);
  date.setHours(10, 30, 0, 0);
  return Timestamp.fromDate(date);
}

function hoursAgo(n: number): Timestamp {
  const date = new Date();
  date.setHours(date.getHours() - n);
  return Timestamp.fromDate(date);
}

/**
 * Demo Journal Entries
 */
export const DEMO_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'demo-entry-1',
    title: 'A slower morning',
    content: 'I woke before my alarm today, which almost never happens. Instead of reaching for my phone, I made tea and watched the light shift across the kitchen. It reminded me that not every morning needs to be rushed. I want to hold onto that feeling of spaciousness, even when work picks up again. The quiet moments feel like gifts I keep forgetting to unwrap.',
    moodRating: 4,
    tags: ['morning', 'mindfulness', 'gratitude'],
    wordCount: 68,
    crisisFlagged: false,
    createdAt: daysAgo(0), // Today
    updatedAt: daysAgo(0),
  },
  {
    id: 'demo-entry-2',
    title: 'Trying to make space',
    content: 'Work has been relentless this week. I find myself holding my breath without realizing it. Tonight I turned off notifications for an hour and just sat with a book. It felt almost rebellious. I noticed how quickly my mind wanted to fill the silence with worry about tomorrow. I gently brought my attention back to the page. Small practice.',
    moodRating: 3,
    tags: ['work', 'boundaries', 'stress'],
    wordCount: 62,
    crisisFlagged: false,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: 'demo-entry-3',
    title: 'The conversation I kept replaying',
    content: 'I had a difficult conversation with a friend yesterday. My mind keeps circling back to what I should have said differently. But then I caught myself and asked: what if nothing needed to be different? What if the discomfort is just part of being honest with someone you care about? Writing this down helps me see that I was brave to say the hard thing.',
    moodRating: 3,
    tags: ['relationships', 'courage', 'self-compassion'],
    wordCount: 76,
    crisisFlagged: false,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  },
  {
    id: 'demo-entry-4',
    title: 'Small things that helped today',
    content: 'A warm cup of coffee. A text from an old friend. Walking the long way home. These small moments added up to something that felt like enough. I tend to look for big solutions, but today reminded me that the small things matter too. I want to remember this when I feel overwhelmed.',
    moodRating: 4,
    tags: ['gratitude', 'small-moments', 'wellbeing'],
    wordCount: 61,
    crisisFlagged: false,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
  },
  {
    id: 'demo-entry-5',
    title: 'Evening thoughts',
    content: 'Tonight I sat on my balcony and watched the sunset. The colors were soft and unhurried, and for a moment, I felt my shoulders drop. I realized how much tension I had been carrying without noticing. I want to create more moments like this—intentional pauses in my day.',
    moodRating: 5,
    tags: ['evening', 'mindfulness', 'peace'],
    wordCount: 52,
    crisisFlagged: false,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
  },
  {
    id: 'demo-entry-6',
    title: 'A difficult afternoon',
    content: 'I felt overwhelmed by deadlines today. The anxious thoughts kept spiraling. Eventually I stepped outside and took three slow breaths. It did not solve anything, but it created a small gap between me and the worry. That gap is where I found the strength to continue.',
    moodRating: 2,
    tags: ['anxiety', 'stress', 'coping'],
    wordCount: 56,
    crisisFlagged: false,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
  },
  {
    id: 'demo-entry-7',
    title: 'Something shifting',
    content: 'I have been reflecting more consistently lately, and I am starting to notice patterns. My mood tends to dip on Sundays. I feel more creative in the mornings. These observations feel like small keys to understanding myself better. I want to keep paying attention.',
    moodRating: 4,
    tags: ['patterns', 'self-awareness', 'growth'],
    wordCount: 52,
    crisisFlagged: false,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
  },
];

/**
 * Demo Conversations
 */
export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'demo-conv-1',
    title: 'Reflection on work boundaries',
    summary: 'Explored the challenge of setting boundaries at work and how small pauses throughout the day can help maintain a sense of spaciousness.',
    status: 'completed',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    summaryUpdatedAt: daysAgo(2),
  },
  {
    id: 'demo-conv-2',
    title: 'Navigating a difficult conversation',
    summary: 'Reflected on a tough conversation with a friend, exploring the discomfort of honesty and the courage it takes to speak from the heart.',
    status: 'completed',
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    summaryUpdatedAt: daysAgo(4),
  },
  {
    id: 'demo-conv-3',
    title: 'Finding calm in the chaos',
    summary: null,
    status: 'active',
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(1),
    summaryUpdatedAt: null,
  },
];

/**
 * Demo Messages for each conversation
 */
export const DEMO_MESSAGES: Record<string, ReflectionMessage[]> = {
  'demo-conv-1': [
    {
      id: 'msg-1-1',
      role: 'user',
      content: 'I have been struggling to set boundaries at work. It feels like I am always available, and it is exhausting me.',
      createdAt: daysAgo(2),
    },
    {
      id: 'msg-1-2',
      role: 'assistant',
      content: 'That sounds draining. What does being "always available" look like in your day-to-day? Are there specific moments when you feel the weight of it most?',
      createdAt: daysAgo(2),
    },
    {
      id: 'msg-1-3',
      role: 'user',
      content: 'It is the notifications mostly—Slack, email, all hours. I feel like I have to respond immediately or I am failing somehow.',
      createdAt: daysAgo(2),
    },
    {
      id: 'msg-1-4',
      role: 'assistant',
      content: 'The expectation to respond immediately can feel like a demand on your presence. What might it be like to experiment with a small pause—even just five minutes—before responding? Would that feel possible?',
      createdAt: daysAgo(2),
    },
    {
      id: 'msg-1-5',
      role: 'user',
      content: 'I think I could try that. Even just turning off notifications for an hour tonight felt like a relief.',
      createdAt: daysAgo(2),
    },
    {
      id: 'msg-1-6',
      role: 'assistant',
      content: 'That relief is worth noticing. It is a signal that you already know how to create some space for yourself. The practice is remembering you are allowed to take it.',
      createdAt: daysAgo(2),
    },
  ],
  'demo-conv-2': [
    {
      id: 'msg-2-1',
      role: 'user',
      content: 'I had a really hard conversation with a friend yesterday. I keep replaying it in my head.',
      createdAt: daysAgo(4),
    },
    {
      id: 'msg-2-2',
      role: 'assistant',
      content: 'Replaying difficult conversations is a common experience. What part of the conversation stays with you most?',
      createdAt: daysAgo(4),
    },
    {
      id: 'msg-2-3',
      role: 'user',
      content: 'I said something honest, and I could see it hurt them. I do not regret the honesty, but I wish it had not caused pain.',
      createdAt: daysAgo(4),
    },
    {
      id: 'msg-2-4',
      role: 'assistant',
      content: 'Honesty and care are not always easy to hold together. It sounds like you were being true to yourself while still caring about their feelings. That is a difficult balance to strike. What would you want them to understand about your intentions?',
      createdAt: daysAgo(4),
    },
    {
      id: 'msg-2-5',
      role: 'user',
      content: 'That I did not want to hurt them. That I value our friendship. That I hope we can talk through it.',
      createdAt: daysAgo(4),
    },
    {
      id: 'msg-2-6',
      role: 'assistant',
      content: 'Those intentions are clear and compassionate. The discomfort you feel is part of caring. When you are ready, sharing those intentions with your friend might open a path forward together.',
      createdAt: daysAgo(4),
    },
  ],
  'demo-conv-3': [
    {
      id: 'msg-3-1',
      role: 'user',
      content: 'Today feels chaotic. I cannot seem to find a moment of peace.',
      createdAt: hoursAgo(2),
    },
    {
      id: 'msg-3-2',
      role: 'assistant',
      content: 'Chaos has a way of filling every corner. What would a small moment of peace look like for you right now—even just a minute?',
      createdAt: hoursAgo(2),
    },
    {
      id: 'msg-3-3',
      role: 'user',
      content: 'Maybe just sitting here, breathing, without thinking about everything I have to do.',
      createdAt: hoursAgo(1),
    },
  ],
};

/**
 * Demo PatternShift Insight
 */
export const DEMO_PATTERN_INSIGHT: PatternShiftInsight = {
  id: 'demo-insight-1',
  generatedAt: new Date().toISOString(),
  timeRange: {
    start: daysAgo(14).toDate().toISOString().split('T')[0],
    end: daysAgo(0).toDate().toISOString().split('T')[0],
  },
  itemCount: {
    entries: 7,
    completedConversations: 2,
    total: 9,
  },
  metrics: {
    entryCount: 7,
    completedConversationCount: 2,
    totalItems: 9,
    timeRange: {
      start: daysAgo(14).toDate().toISOString().split('T')[0],
      end: daysAgo(0).toDate().toISOString().split('T')[0],
    },
    mood: {
      distribution: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 1 },
      averageMood: 3.6,
      standardDeviation: 0.8,
      trajectory: 'improving',
      earlierAverageMood: 3.2,
      recentAverageMood: 4.0,
    },
    tags: {
      tagFrequencies: [
        { tag: 'mindfulness', count: 3 },
        { tag: 'gratitude', count: 2 },
        { tag: 'stress', count: 2 },
        { tag: 'relationships', count: 1 },
        { tag: 'work', count: 1 },
        { tag: 'courage', count: 1 },
        { tag: 'growth', count: 1 },
        { tag: 'self-awareness', count: 1 },
      ],
      topTags: ['mindfulness', 'gratitude', 'stress'],
      tagMoodAssociations: [
        { tag: 'mindfulness', averageMood: 4.5, count: 3 },
        { tag: 'gratitude', averageMood: 4.5, count: 2 },
        { tag: 'stress', averageMood: 2.5, count: 2 },
        { tag: 'relationships', averageMood: 3.0, count: 1 },
        { tag: 'work', averageMood: 3.0, count: 1 },
      ],
      tagVelocity: [
        { tag: 'mindfulness', earlierCount: 1, recentCount: 2, trend: 'increasing' },
        { tag: 'gratitude', earlierCount: 1, recentCount: 1, trend: 'stable' },
        { tag: 'stress', earlierCount: 1, recentCount: 1, trend: 'stable' },
      ],
    },
    themes: {
      topKeywords: [
        { word: 'moment', count: 5 },
        { word: 'today', count: 4 },
        { word: 'feel', count: 4 },
        { word: 'small', count: 3 },
        { word: 'time', count: 3 },
      ],
      reflectionThemes: [
        'Finding peace in small pauses',
        'Navigating work-life boundaries',
        'Honesty in relationships',
        'Self-compassion during stress',
      ],
    },
  },
  observations: [
    'Your recent entries show more reflective language during evening hours, suggesting a natural time for introspection.',
    'The "mindfulness" tag appears frequently and is associated with higher mood ratings, indicating it may be a helpful anchor for you.',
    'Your mood trajectory shows an upward trend this week, with recent entries averaging higher than earlier ones.',
    'You often return to themes of "small moments" and "spaciousness," which may be core values worth nurturing.',
  ],
  suggestedInquiries: [
    'What would it feel like to create one small pause in my day tomorrow?',
    'How do I feel when I give myself permission to not respond immediately?',
    'What patterns do I notice in when I feel most at peace?',
    'How might I bring more of what works into my daily rhythm?',
  ],
  type: 'patternshift',
};
