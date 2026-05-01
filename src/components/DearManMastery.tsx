import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, 
  MessageSquare, 
  BarChart3, 
  Send, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Quote,
  Target,
  Brain,
  Shield,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type View = 'tracker' | 'practice' | 'analysis';

interface DearManLog {
  id?: string;
  describe: string;
  express: string;
  assert: string;
  reinforce: string;
  mindfulnessGoal: string;
  mindfulnessDistractions: string;
  confidence: string;
  negotiate: string;
  createdAt: any;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export default function DearManMastery({ user }: { user: any }) {
  const [activeView, setActiveView] = useState<View>('tracker');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Tracker Form State
  const [formData, setFormData] = useState({
    describe: '',
    express: '',
    assert: '',
    reinforce: '',
    mindfulnessGoal: '',
    mindfulnessDistractions: '',
    confidence: '',
    negotiate: ''
  });

  // Practice State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Analysis State
  const [logStats, setLogStats] = useState({ count: 0, lastDate: 'Never' });
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (user && activeView === 'analysis') {
      fetchLogStats();
    }
  }, [user, activeView]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const fetchLogStats = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'dear_man_logs'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs;
      
      if (logs.length > 0) {
        const lastLog = logs[0].data();
        const lastDate = lastLog.createdAt instanceof Timestamp 
          ? lastLog.createdAt.toDate().toLocaleDateString() 
          : new Date(lastLog.createdAt).toLocaleDateString();
        
        setLogStats({ count: logs.length, lastDate });
      } else {
        setLogStats({ count: 0, lastDate: 'Never' });
      }
    } catch (error) {
      console.error('Error fetching log stats:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const resetForm = () => {
    setFormData({
      describe: '',
      express: '',
      assert: '',
      reinforce: '',
      mindfulnessGoal: '',
      mindfulnessDistractions: '',
      confidence: '',
      negotiate: ''
    });
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'dear_man_logs'), {
        ...formData,
        userId: user.uid,
        userEmail: user.email,
        createdAt: serverTimestamp()
      });
      showToast('Entry saved successfully!');
      resetForm();
    } catch (error) {
      console.error('Error saving entry:', error);
      showToast('Error saving entry. Try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isTyping) return;

    const userMessage: ChatMessage = {
      role: 'user',
      parts: [{ text: chatInput }]
    };

    const newHistory = [...chatHistory, userMessage];
    setChatHistory(newHistory);
    setChatInput('');
    setIsTyping(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: newHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msg.parts
        })),
        config: {
          systemInstruction: `You are an expert DBT (Dialectical Behavior Therapy) coach. Your goal is to help the user practice the "DEAR MAN" skill for effective interpersonal communication.
          DEAR MAN stands for:
          Describe, Express, Assert, Reinforce, (stay) Mindful, Appear confident, Negotiate.
          
          Role-play instructions:
          1. Act as the person the user is trying to communicate with (e.g., a landlord, a boss, a family member).
          2. React realistically to their DEAR MAN attempts.
          3. Occasionally provide brief coaching tips if they miss a component or if they are being too passive/aggressive.
          4. Encourage them to keep trying if they fail.
          
          Start by asking what scenario they want to practice today if they haven't specified.`
        }
      });

      const responseText = response.text || "I'm sorry, I couldn't generate a response.";
      setChatHistory(prev => [...prev, {
        role: 'model',
        parts: [{ text: responseText }]
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      setChatHistory(prev => [...prev, {
        role: 'model',
        parts: [{ text: 'Connection error. Please try again.' }]
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateAnalysis = async () => {
    if (!user) return;
    setIsAnalyzing(true);
    setAnalysisText(null);

    try {
      // Get last 10 logs
      const q = query(
        collection(db, 'dear_man_logs'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => doc.data());

      if (logs.length === 0) {
        setAnalysisText("<p class='text-slate-400'>You haven't logged any DEAR MAN interactions yet. Use the Tracker to log a few conversations first so I have some data to analyze!</p>");
        return;
      }

      const prompt = `Analyze the following DEAR MAN log entries for a coaching client. Provide a summary of their progress, identify recurring strengths, and suggest 2-3 specific areas for improvement. Format the output in clean HTML with <h3> headings and <ul> lists.
      
      Client Logs:
      ${JSON.stringify(logs, null, 2)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            systemInstruction: "You are a professional DBT skills coach. Provide insightful, encouraging, and actionable feedback based on communication logs."
        }
      });

      setAnalysisText(response.text || "Analysis could not be generated.");
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisText("<p class='text-red-400'>Error generating analysis. Please try again.</p>");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-4 max-w-2xl mx-auto overflow-hidden">
      {/* Header */}
      <header className="mb-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 overflow-hidden mb-3">
           <img 
            src="https://mrleeteaches.com/wp-content/uploads/2025/08/Designer-2.webp" 
            alt="Penguin Logo" 
            className="w-full h-full object-cover"
          />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">DEAR MAN Mastery</h1>
        <p className="text-sm text-slate-400">DBT Communication Excellence</p>
      </header>

      {/* Tabs */}
      <div className="bg-slate-800 p-1 rounded-xl flex w-full border border-slate-700 shadow-inner mb-6">
        {(['tracker', 'practice', 'analysis'] as View[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
              activeView === tab 
                ? 'bg-brand-secondary text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'tracker' && <ChevronRight className="w-4 h-4" />}
            {tab === 'practice' && <MessageSquare className="w-4 h-4" />}
            {tab === 'analysis' && <BarChart3 className="w-4 h-4" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-grow overflow-y-auto no-scrollbar pb-20 relative">
        <AnimatePresence mode="wait">
          {activeView === 'tracker' && (
            <motion.div
              key="tracker"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <form onSubmit={handleSaveEntry} className="space-y-5">
                {/* Describe */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <Quote className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Describe</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-3 italic">State the facts objectively. What is happening?</p>
                  <textarea 
                    id="describe"
                    value={formData.describe}
                    onChange={handleInputChange}
                    placeholder="Stick to the facts..."
                    className="w-full h-24 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700 transition-all"
                    required
                  />
                </div>

                {/* Express */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Express</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-3 italic">How do you feel? Use "I" statements.</p>
                  <textarea 
                    id="express"
                    value={formData.express}
                    onChange={handleInputChange}
                    placeholder="I feel ___ when ___"
                    className="w-full h-20 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700 transition-all"
                    required
                  />
                </div>

                {/* Assert */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Assert</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-3 italic">State clearly what you want or need.</p>
                  <textarea 
                    id="assert"
                    value={formData.assert}
                    onChange={handleInputChange}
                    placeholder="I would like..."
                    className="w-full h-20 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700 transition-all"
                    required
                  />
                </div>

                {/* Reinforce */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Reinforce</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-3 italic">How does this benefit the other person or the relationship?</p>
                  <textarea 
                    id="reinforce"
                    value={formData.reinforce}
                    onChange={handleInputChange}
                    placeholder="This would help us because..."
                    className="w-full h-20 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700 transition-all"
                    required
                  />
                </div>

                {/* Mindfulness */}
                <div className="bg-brand-secondary/5 p-5 rounded-2xl border border-brand-secondary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Stay Mindful</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-2 italic">What is the core objective?</p>
                  <input 
                    type="text"
                    id="mindfulnessGoal"
                    value={formData.mindfulnessGoal}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 mb-3 border border-slate-700"
                    placeholder="Primary goal..."
                    required
                  />
                  <p className="text-slate-400 text-xs mb-2 italic">What topics might distract you?</p>
                  <textarea 
                    id="mindfulnessDistractions"
                    value={formData.mindfulnessDistractions}
                    onChange={handleInputChange}
                    className="w-full h-16 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700"
                    placeholder="Potential side-tracks..."
                    required
                  />
                </div>

                {/* Confidence */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                   <div className="flex items-center gap-2 mb-1">
                    <ChevronRight className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Appear Confident</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-3 italic">Posture, eye contact, and tone of voice.</p>
                  <textarea 
                    id="confidence"
                    value={formData.confidence}
                    onChange={handleInputChange}
                    placeholder="Maintain direct eye contact..."
                    className="w-full h-20 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700 transition-all"
                    required
                  />
                </div>

                {/* Negotiate */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-brand-secondary" />
                    <label className="font-bold text-brand-secondary">Negotiate</label>
                  </div>
                  <p className="text-slate-400 text-xs mb-3 italic">What are your alternatives or compromises?</p>
                  <textarea 
                    id="negotiate"
                    value={formData.negotiate}
                    onChange={handleInputChange}
                    placeholder="If that's not possible, we could..."
                    className="w-full h-20 bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 resize-none border border-slate-700 transition-all"
                    required
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="w-full bg-brand-secondary hover:bg-brand-secondary/80 text-white font-bold py-4 rounded-2xl text-xl shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                  <span>{isSaving ? 'Saving...' : 'Save Entry'}</span>
                </button>
              </form>
            </motion.div>
          )}

          {activeView === 'practice' && (
            <motion.div
              key="practice"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-[60vh] bg-slate-800/30 rounded-2xl border border-slate-700/50 p-4"
            >
              <div className="flex-grow overflow-y-auto no-scrollbar space-y-4 mb-4 pr-1">
                <div className="self-start max-w-[85%] bg-slate-800 border border-slate-700 p-3 rounded-2xl rounded-tl-none text-sm text-slate-200">
                  Hello! I am your DEAR MAN practice partner. What scenario are we practicing today, and who would you like me to be?
                </div>
                
                {chatHistory.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                      msg.role === 'user' 
                        ? 'self-end ml-auto bg-brand-secondary text-white rounded-tr-none' 
                        : 'self-start bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    {msg.parts[0].text}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 italic ml-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-brand-secondary" />
                    AI is typing...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2 p-1">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Ask a scenario... (or 'END ROLEPLAY')" 
                  className="flex-grow bg-slate-900 text-white rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary/50 border border-slate-700 transition-all"
                  disabled={isTyping}
                />
                <button 
                  onClick={handleSendChat}
                  disabled={isTyping || !chatInput.trim()}
                  className="bg-brand-secondary hover:bg-brand-secondary/80 text-white px-5 rounded-xl transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {activeView === 'analysis' && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col h-full bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6"
            >
              <div className="text-center mb-6 flex flex-col items-center">
                <div className="p-4 bg-brand-secondary/10 rounded-full mb-4">
                  <BarChart3 className="w-12 h-12 text-brand-secondary" />
                </div>
                <h3 className="text-2xl font-bold text-slate-100 mb-2">Conversation Insights</h3>
                <p className="text-sm text-slate-400 mb-6 text-center max-w-[300px]">Analyze your past entries to find communication patterns, strengths, and areas to focus on.</p>
                
                <div className="bg-slate-900 p-5 rounded-2xl mb-8 border border-slate-700 shadow-xl w-full max-w-[300px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-xs">Total Entries</span>
                    <span className="bg-brand-secondary/20 text-brand-secondary px-2 py-0.5 rounded-full text-xs font-bold">
                      {logStats.count}
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-brand-secondary text-center mb-4">
                    {logStats.count} Logs
                  </div>
                  <div className="border-t border-slate-700 pt-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mb-1">Latest Practice</p>
                    <p className="text-sm text-slate-200 font-medium text-center">{logStats.lastDate}</p>
                  </div>
                </div>
                
                <button 
                  onClick={handleGenerateAnalysis}
                  disabled={isAnalyzing}
                  className="bg-brand-secondary hover:bg-brand-secondary/80 text-white font-bold py-4 px-8 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 w-full max-w-[300px] disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      <span>{analysisText ? 'Refresh Insights' : 'Generate My Insights'}</span>
                    </>
                  )}
                </button>
              </div>

              {analysisText && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-6 bg-slate-900/50 rounded-2xl border border-slate-700 prose prose-invert prose-emerald max-w-none"
                  dangerouslySetInnerHTML={{ __html: analysisText }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl border font-medium z-50 flex items-center gap-2 ${
              toast.type === 'success' 
                ? 'bg-slate-800 text-brand-secondary border-brand-secondary' 
                : 'bg-red-900/90 text-red-100 border-red-500'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Global Styles for Analysis Content */}
      <style >{`
        .prose h3 { color: #10b981; font-size: 1.1rem; font-weight: bold; margin-top: 1rem; margin-bottom: 0.5rem; }
        .prose ul { list-style-type: disc; margin-left: 1.5rem; margin-bottom: 1rem; color: #cbd5e1; }
        .prose li { margin-bottom: 0.25rem; }
        .prose p { margin-bottom: 1rem; }
      `}</style>
    </div>
  );
}
