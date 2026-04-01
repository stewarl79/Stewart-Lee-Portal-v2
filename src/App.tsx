import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  FileText, 
  Bell, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Mail, 
  Upload, 
  Download, 
  Trash2, 
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Menu,
  X,
  Edit2,
  UserPlus,
  RefreshCw,
  Share2,
  Library,
  MessageSquare,
  FolderOpen,
  ShieldCheck,
  FileCheck,
  ArrowRight,
  ArrowLeft,
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isAfter, isBefore, addHours, startOfDay, endOfDay, parseISO, differenceInHours, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const VAPID_PUBLIC_KEY = 'BLUp9ngKYOHuvx61MrWHFHsaHJwiPUjOPy7XE7hCV7mRC0sPBy-SDLs9lPy2XODh1JbPb26HeCYVZE9qEKbNXe0';

function safeToDate(date: any): Date {
  if (!date) return new Date();
  if (typeof date.toDate === 'function') return date.toDate();
  if (date._seconds) return new Date(date._seconds * 1000);
  if (date.seconds) return new Date(date.seconds * 1000);
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

// --- Types ---
type Role = 'coach' | 'client';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phone?: string;
  role: Role;
  isActive?: boolean;
  createdAt: any;
  mustChangePassword?: boolean;
  reminderTemplate?: string;
  isOnboarded?: boolean;
  age?: number;
  preferredName?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  formalDiagnosis?: string;
  schedulingConstraints?: string;
  prompt?: string;
  challenges?: string[];
  otherChallenge?: string;
  duration?: string;
  seeingTherapist?: string;
  strengths?: string;
  frequency?: string;
  anythingElse?: string;
  onboardingData?: any;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  secondaryParentName?: string;
  secondaryParentPhone?: string;
  secondaryParentEmail?: string;
}

interface Appointment {
  id: string;
  title: string;
  description?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  clientEmail: string;
  clientUid?: string;
  isExternal: boolean;
  status: 'scheduled' | 'completed' | 'cancelled';
  remindersSent: string[];
  notes?: string;
  meetLink?: string;
}

interface SharedDocument {
  id: string;
  name: string;
  url: string;
  ownerUid: string;
  sharedWithEmail: string;
  sharedWithUid?: string;
  createdAt: Timestamp;
}

interface Message {
  id: string;
  senderUid: string;
  receiverUid: string;
  content: string;
  createdAt: Timestamp;
  isRead: boolean;
  type: 'text' | 'system';
  metadata?: any;
}

const isCalendarId = (email: string) => {
  return email.includes('calendar.google.com');
};

const getGoogleCalendarLink = (appt: Appointment) => {
  const start = safeToDate(appt.startTime).toISOString().replace(/-|:|\.\d\d\d/g, '');
  const end = safeToDate(appt.endTime).toISOString().replace(/-|:|\.\d\d\d/g, '');
  const details = appt.description || appt.notes || '';
  const location = appt.meetLink || '';
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(appt.title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
};

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick,
  badge
}: { 
  icon: any; 
  label: string; 
  active: boolean; 
  onClick: () => void;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <div className="flex items-center gap-3">
      <Icon className={cn("w-5 h-5", active ? "text-white" : "group-hover:text-emerald-400")} />
      <span className="font-medium">{label}</span>
    </div>
    {badge !== undefined && badge > 0 && (
      <span className={cn(
        "px-2 py-0.5 text-[10px] font-bold rounded-full",
        active ? "bg-white text-emerald-600" : "bg-emerald-500 text-white"
      )}>
        {badge}
      </span>
    )}
  </button>
);

const Card = ({ children, title, subtitle, action, className }: any) => (
  <div className={cn("bg-slate-900 border border-slate-800 rounded-2xl p-6 overflow-hidden", className)}>
    <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' }) => {
  const variants = {
    default: "bg-slate-800 text-slate-300",
    success: "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50",
    warning: "bg-amber-900/30 text-amber-400 border border-amber-800/50",
    error: "bg-rose-900/30 text-rose-400 border border-rose-800/50"
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant])}>
      {children}
    </span>
  );
};

// --- Messaging Component ---
const MessagingView = ({ 
  user, 
  profile, 
  clients, 
  messages, 
  coachProfile,
  onSendMessage,
  onMarkAsRead,
  selectedClient,
  setSelectedClient
}: { 
  user: User; 
  profile: UserProfile; 
  clients: UserProfile[]; 
  messages: Message[]; 
  coachProfile: UserProfile | null;
  onSendMessage: (receiverUid: string, content: string) => void;
  onMarkAsRead: (messageId: string) => void;
  selectedClient: string | null;
  setSelectedClient: (uid: string | null) => void;
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [showInactiveInChat, setShowInactiveInChat] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const coach = coachProfile || { uid: 'coach', displayName: 'Stewart Lee', email: 'msustewart@gmail.com' };

  const activeClients = clients.filter(c => c.isActive !== false);
  const inactiveClients = clients.filter(c => c.isActive === false);
  const visibleClients = showInactiveInChat ? clients : activeClients;

  const chatPartner = profile?.role === 'coach' 
    ? clients.find(c => c.uid === selectedClient)
    : coach;

  const filteredMessages = useMemo(() => {
    if (profile?.role === 'client') {
      return messages.filter(m => 
        (m.senderUid === user.uid && m.receiverUid !== user.uid) || 
        (m.receiverUid === user.uid)
      ).sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
    }
    if (!selectedClient) return [];
    return messages.filter(m => 
      (m.senderUid === user.uid && m.receiverUid === selectedClient) || 
      (m.senderUid === selectedClient && m.receiverUid === user.uid)
    ).sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
  }, [messages, selectedClient, user.uid, profile?.role]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    
    // Mark unread messages as read - only if they are for the current user
    // and we use a ref to track which ones we've already tried to mark as read
    // to prevent infinite loops if Firestore is slow to update.
    const unreadMessages = filteredMessages.filter(m => m.receiverUid === user.uid && !m.isRead);
    if (unreadMessages.length > 0) {
      unreadMessages.forEach(m => {
        onMarkAsRead(m.id);
      });
    }
  }, [filteredMessages.length, user.uid, onMarkAsRead]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const receiverUid = profile?.role === 'coach' ? selectedClient : coach.uid;
    if (!receiverUid) return;
    onSendMessage(receiverUid, newMessage);
    setNewMessage('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-12rem)] min-h-[600px]">
      {profile?.role === 'coach' && (
        <Card title="Clients" className="lg:col-span-1 flex flex-col h-full">
          {inactiveClients.length > 0 && (
            <div className="px-4 pb-2 border-b border-slate-800 mb-2">
              <button 
                onClick={() => setShowInactiveInChat(!showInactiveInChat)}
                className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-emerald-500 transition-colors flex items-center gap-1"
              >
                {showInactiveInChat ? 'Hide Inactive' : `Show Inactive (${inactiveClients.length})`}
              </button>
            </div>
          )}
          <div className="space-y-2 overflow-y-auto flex-1 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            {visibleClients.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No {showInactiveInChat ? '' : 'active'} clients found.
              </div>
            ) : (
              visibleClients.map(client => {
                const unreadCount = messages.filter(m => m.senderUid === client.uid && m.receiverUid === user.uid && !m.isRead).length;
                return (
                  <button
                    key={client.uid}
                    onClick={() => setSelectedClient(client.uid)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                      selectedClient === client.uid 
                        ? "bg-emerald-600/10 border-emerald-500/50 text-white" 
                        : "bg-slate-800/30 border-slate-700/30 text-slate-400 hover:bg-slate-800/50"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                        {client.displayName[0]}
                      </div>
                      <span className="text-sm font-medium truncate">{client.displayName}</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Card>
      )}

      <Card 
        title={chatPartner ? `Chat with ${chatPartner.displayName}` : "Select a client to start messaging"} 
        className={cn("flex flex-col h-full", profile?.role === 'coach' ? "lg:col-span-3" : "lg:col-span-4")}
      >
        {!chatPartner && profile?.role === 'coach' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 min-h-[300px]">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-center px-4">Select a client from the list to start a conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-slate-700"
            >
              {filteredMessages.length === 0 ? (
                <div className="text-center py-12 text-slate-600 italic text-sm">
                  No messages yet. Send a message to start the conversation!
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const isMe = msg.senderUid === user.uid;
                  return (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "flex flex-col",
                        isMe ? "items-end" : "items-start"
                      )}
                    >
                      <div className={cn(
                        "max-w-[80%] p-4 rounded-2xl text-sm shadow-sm",
                        isMe 
                          ? "bg-emerald-600 text-white rounded-tr-none" 
                          : "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700"
                      )}>
                        {msg.type === 'system' && (
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider opacity-80">
                            <AlertCircle className="w-3 h-3" /> System Notification
                          </div>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        {msg.metadata?.documentUrl && (
                          <a 
                            href={msg.metadata.documentUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={cn(
                              "mt-3 flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-all",
                              isMe ? "bg-white/10 hover:bg-white/20" : "bg-slate-900/50 hover:bg-slate-900"
                            )}
                          >
                            <FileText className="w-4 h-4" />
                            <span className="truncate">{msg.metadata.documentName}</span>
                            <ExternalLink className="w-3 h-3 ml-auto" />
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 px-1">
                        {format(safeToDate(msg.createdAt), 'h:mm a')}
                        {isMe && (
                          <span className="ml-2">
                            {msg.isRead ? 'Read' : 'Sent'}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSend} className="flex gap-2 pt-4 border-t border-slate-800">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showLateNoticeModal, setShowLateNoticeModal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered', reg))
        .catch(err => console.error('Service Worker registration failed', err));
    }
  }, []);

  useEffect(() => {
    // Check permission status periodically or on focus
    const checkPermission = () => {
      if (typeof Notification !== 'undefined') {
        setNotificationPermission(Notification.permission);
      }
    };
    
    window.addEventListener('focus', checkPermission);
    return () => window.removeEventListener('focus', checkPermission);
  }, []);

  useEffect(() => {
    if (user && notificationPermission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (registration) => {
        try {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription, userId: user.uid })
          });
          console.log('Push subscription successful');
        } catch (error) {
          console.error('Failed to subscribe to push notifications:', error);
        }
      });
    }
  }, [user, notificationPermission]);

  const requestNotificationPermission = React.useCallback(async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notification');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        new Notification('Notifications Enabled', {
          body: 'You will now receive updates for appointments, documents, and messages.',
          icon: '/logo.png'
        });
      } else if (permission === 'denied') {
        console.warn('Notification permission denied');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  }, []);

  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [actionType, setActionType] = useState<'cancel' | 'reschedule'>('cancel');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestDate, setRequestDate] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  
  // Auth UI states
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // Data states
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChatClient, setSelectedChatClient] = useState<string | null>(null);
  const [coachProfile, setCoachProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        unsubProfile = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            setProfile(profileData);
            if (profileData.mustChangePassword) {
              setShowPasswordChange(true);
            }
          } else {
            // New user - default to client unless it's the coach email
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email!,
              displayName: u.displayName || 'User',
              role: u.email === 'msustewart@gmail.com' ? 'coach' : 'client',
              createdAt: serverTimestamp(),
              isOnboarded: u.email === 'msustewart@gmail.com' ? true : false
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, 'users');
          setLoading(false);
        });
      } else {
        setProfile(null);
        if (unsubProfile) unsubProfile();
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Fetch coach profile for clients
  useEffect(() => {
    if (!user || !profile || profile.role === 'coach') return;

    const coachQuery = query(collection(db, 'users'), where('email', '==', 'msustewart@gmail.com'), limit(1));
    const unsubCoach = onSnapshot(coachQuery, (snapshot) => {
      if (!snapshot.empty) {
        setCoachProfile(snapshot.docs[0].data() as UserProfile);
      }
    });

    return () => unsubCoach();
  }, [user, profile]);

  // Real-time listeners: Appointments
  useEffect(() => {
    if (!user || !profile) return;

    const apptsQuery = profile.role === 'coach' 
      ? query(collection(db, 'appointments'), orderBy('startTime', 'asc'))
      : query(collection(db, 'appointments'), where('clientEmail', '==', user.email), orderBy('startTime', 'asc'));

    const unsubAppts = onSnapshot(apptsQuery, (snapshot) => {
      const apptList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
      console.log(`Fetched ${apptList.length} appointments for ${profile.role}`);
      setAppointments(apptList);
    }, (err) => {
      console.error("Appointments listener error:", err);
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    });

    return () => unsubAppts();
  }, [user, profile]);

  // Real-time listeners: Documents
  useEffect(() => {
    if (!user || !profile) return;

    const docsQuery = profile.role === 'coach'
      ? query(collection(db, 'documents'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'documents'), where('sharedWithEmail', '==', user.email), orderBy('createdAt', 'desc'));

    const unsubDocs = onSnapshot(docsQuery, (snapshot) => {
      setDocuments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SharedDocument)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'documents'));

    return () => unsubDocs();
  }, [user, profile]);

  // Real-time listeners: Clients (Coach only)
  useEffect(() => {
    if (!user || !profile || profile.role !== 'coach') return;

    console.log("Coach detected, starting clients listener...");
    const unsubClients = onSnapshot(query(collection(db, 'users'), where('role', '==', 'client')), (snapshot) => {
      const clientList = snapshot.docs.map(d => d.data() as UserProfile);
      console.log(`Fetched ${clientList.length} clients from database:`, firebaseConfig.firestoreDatabaseId);
      setClients(clientList);
    }, (err) => {
      console.error("Clients listener error:", err);
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    return () => unsubClients();
  }, [user, profile]);

  // Real-time listeners: Messages
  useEffect(() => {
    if (!user || !profile) return;

    let isInitialSnapshot = true;

    // We need two queries for messages to get both sent and received
    const sentMessagesQuery = query(collection(db, 'messages'), where('senderUid', '==', user.uid));
    const receivedMessagesQuery = query(collection(db, 'messages'), where('receiverUid', '==', user.uid));

    const unsubSent = onSnapshot(sentMessagesQuery, (snapshot) => {
      const sent = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(prev => {
        const other = prev.filter(m => m.senderUid !== user.uid);
        const combined = [...other, ...sent];
        const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
        return unique.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      });
    });

    const unsubReceived = onSnapshot(receivedMessagesQuery, (snapshot) => {
      const received = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      
      // Handle notifications for new messages
      // We skip the initial snapshot of each listener to avoid duplicate notifications on re-renders
      if (!isInitialSnapshot && notificationPermission === 'granted') {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const msg = change.doc.data() as Message;
            // Only notify for unread messages from others
            if (msg.senderUid !== user.uid && !msg.isRead) {
              const sender = profile?.role === 'coach' 
                ? clients.find(c => c.uid === msg.senderUid)?.displayName || 'Client'
                : 'Coach';
              
              new Notification(`New Message from ${sender}`, {
                body: msg.content,
                icon: '/logo.png',
                tag: msg.id // Prevent duplicate notifications for the same message
              });
            }
          }
        });
      }
      isInitialSnapshot = false;

      setMessages(prev => {
        const other = prev.filter(m => m.receiverUid !== user.uid);
        const combined = [...other, ...received];
        const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
        return unique.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      });
    });

    return () => { unsubSent(); unsubReceived(); };
  }, [user, profile, clients, notificationPermission]);

  const handleGoogleLogin = React.useCallback(async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      console.error('Google Login Error:', error);
      setAuthError(error.message);
    }
  }, []);

  const handleEmailAuth = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    
    try {
      if (authMode === 'signup') {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName });
        // Profile creation is handled by onAuthStateChanged useEffect
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setAuthMessage('Password reset email sent! Check your inbox.');
      }
    } catch (error: any) {
      setAuthError(error.message);
    }
  }, [authMode, email, password, displayName]);

  const handleLogout = React.useCallback(() => {
    signOut(auth);
    setShowPasswordChange(false);
  }, []);

  const handlePasswordChange = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('Password must be at least 6 characters');
      return;
    }

    setPasswordChangeLoading(true);
    setPasswordChangeError('');
    try {
      if (auth.currentUser) {
        console.log("DEBUG: handlePasswordChange - Current UID:", auth.currentUser.uid);
        console.log("DEBUG: handlePasswordChange - Profile UID:", profile?.uid);
        
        // Only update password if it's not a Google user (Google users don't have passwords to update this way)
        const isGoogleUser = auth.currentUser.providerData.some(p => p.providerId === 'google.com');
        console.log("DEBUG: handlePasswordChange - isGoogleUser:", isGoogleUser);
        
        if (!isGoogleUser) {
          console.log("DEBUG: handlePasswordChange - Updating Auth password...");
          await updatePassword(auth.currentUser, newPassword);
        } else {
          console.log("DEBUG: handlePasswordChange - Skipping Auth password update for Google user.");
        }

        console.log("DEBUG: handlePasswordChange - Updating Firestore profile...");
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          mustChangePassword: false
        });
        
        setShowPasswordChange(false);
        setProfile(prev => prev ? { ...prev, mustChangePassword: false } : null);
        alert('Password changed successfully!');
      }
    } catch (error: any) {
      console.error('Password change error:', error);
      if (error.code === 'permission-denied') {
        setPasswordChangeError('Permission denied. Please contact your coach.');
      } else {
        setPasswordChangeError(error.message);
      }
    } finally {
      setPasswordChangeLoading(false);
    }
  }, [newPassword, confirmPassword, profile?.uid]);

  const handleReschedule = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedAppointment.id,
          reason: actionReason,
          desiredDateTime: rescheduleDate,
          clientName: profile?.displayName
        })
      });
      if (!response.ok) throw new Error('Failed to request reschedule');
      setShowActionModal(false);
      setActionReason('');
      setRescheduleDate('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }, [selectedAppointment, actionReason, rescheduleDate, profile?.displayName]);

  const handleCancel = React.useCallback(async () => {
    if (!selectedAppointment) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedAppointment.id,
          reason: actionReason,
          clientName: profile?.displayName
        })
      });
      if (!response.ok) throw new Error('Failed to cancel appointment');
      setShowActionModal(false);
      setActionReason('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }, [selectedAppointment, actionReason, profile?.displayName]);

  const handleRequest = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const response = await fetch('/api/appointments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user?.uid,
          email: user?.email,
          displayName: profile?.displayName,
          reason: requestReason,
          desiredDateTime: requestDate
        })
      });
      if (!response.ok) throw new Error('Failed to submit request');
      setShowRequestModal(false);
      setRequestReason('');
      setRequestDate('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }, [user?.uid, user?.email, profile?.displayName, requestReason, requestDate]);

  const openAction = React.useCallback((appt: any, type: 'cancel' | 'reschedule') => {
    const hoursDiff = differenceInHours(safeToDate(appt.startTime), new Date());
    if (hoursDiff <= 24) {
      setShowLateNoticeModal(true);
    } else {
      setSelectedAppointment(appt);
      setActionType(type);
      setShowActionModal(true);
    }
  }, []);

  const handleSendMessage = React.useCallback(async (receiverUid: string, content: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'messages'), {
        senderUid: user.uid,
        receiverUid,
        content,
        createdAt: serverTimestamp(),
        isRead: false,
        type: 'text'
      });

      // Trigger push notification via server
      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverUid,
          title: `New Message from ${profile?.displayName || 'User'}`,
          body: content,
          data: { url: '/messages' }
        })
      }).catch(err => console.error('Failed to trigger push notification', err));
    } catch (err) {
      console.error('Failed to send message', err);
    }
  }, [user, profile?.displayName]);

  const handleMarkAsRead = React.useCallback(async (messageId: string) => {
    try {
      await updateDoc(doc(db, 'messages', messageId), {
        isRead: true
      });
    } catch (err) {
      console.error('Failed to mark message as read', err);
    }
  }, []);

  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 mb-6">
              <img 
                src="/logo.png" 
                alt="MrLeeTeaches Logo" 
                className="w-full h-full object-contain rounded-2xl"
                onError={(e) => {
                  e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
                }}
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">MrLeeTeaches</h1>
            <p className="text-emerald-500 font-medium text-sm mb-4">Neurodiversity Coaching</p>
            <p className="text-slate-400 mb-8">
              {authMode === 'login' && 'Welcome back! Please sign in to your account.'}
              {authMode === 'signup' && 'Join the coaching portal to get started.'}
              {authMode === 'forgot' && 'Enter your email to reset your password.'}
            </p>
            
            {authError && (
              <div className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm p-3 rounded-xl mb-6">
                {authError}
              </div>
            )}

            {authMessage && (
              <div className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-3 rounded-xl mb-6">
                {authMessage}
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="w-full space-y-4 mb-6">
              {authMode === 'signup' && (
                <input
                  type="text"
                  placeholder="Full Name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              )}
              <input
                type="email"
                placeholder="Email Address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {authMode !== 'forgot' && (
                <input
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              )}
              <button
                type="submit"
                className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
              >
                {authMode === 'login' && 'Sign In'}
                {authMode === 'signup' && 'Create Account'}
                {authMode === 'forgot' && 'Send Reset Link'}
              </button>
            </form>

            {authMode === 'login' && (
              <>
                <div className="w-full flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-xs text-slate-500 uppercase font-bold">Or</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 rounded-xl hover:bg-slate-100 transition-all duration-200 shadow-lg shadow-white/5"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>
              </>
            )}

            <div className="mt-8 flex flex-col gap-2">
              {authMode === 'login' ? (
                <>
                  <button onClick={() => setAuthMode('signup')} className="text-sm text-emerald-500 hover:underline">
                    Don't have an account? Sign up
                  </button>
                  <button onClick={() => setAuthMode('forgot')} className="text-sm text-slate-500 hover:underline">
                    Forgot password?
                  </button>
                </>
              ) : (
                <button onClick={() => setAuthMode('login')} className="text-sm text-emerald-500 hover:underline">
                  Back to login
                </button>
              )}
            </div>
            
            <p className="mt-8 text-[10px] text-slate-600 uppercase tracking-widest">
              MrLeeTeaches Coaching Portal
            </p>
            <a 
              href="https://mrleeteaches.com/privacypolicy/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-4 text-[10px] text-slate-500 hover:text-emerald-500 transition-colors"
            >
              Privacy Policy
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  if (profile?.role === 'client' && !profile?.isOnboarded && !showPasswordChange) {
    return <OnboardingView user={user} onComplete={() => {
      setProfile(prev => prev ? { ...prev, isOnboarded: true } : null);
    }} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <DashboardView 
          appointments={appointments} 
          clients={clients} 
          documents={documents} 
          messages={messages}
          profile={profile} 
          setActiveTab={setActiveTab} 
          onRequestSession={() => setShowRequestModal(true)}
          onAction={openAction}
          onSelectClient={(client: any) => {
            setSelectedClient(client);
            setActiveTab('clients');
          }}
          notificationPermission={notificationPermission}
          onRequestNotifications={requestNotificationPermission}
        />
      );
      case 'calendar': return (
        <CalendarView 
          appointments={appointments} 
          role={profile?.role} 
          onAction={openAction}
        />
      );
      case 'clients': return (
        <ClientsView 
          clients={clients} 
          appointments={appointments} 
          documents={documents} 
          role={profile?.role} 
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
        />
      );
      case 'messages': return (
        <MessagingView
          user={user}
          messages={messages}
          clients={clients}
          profile={profile}
          coachProfile={coachProfile}
          onSendMessage={handleSendMessage}
          onMarkAsRead={handleMarkAsRead}
          selectedClient={selectedChatClient}
          setSelectedClient={setSelectedChatClient}
        />
      );
      case 'library': return <LibraryView clients={clients} user={user} />;
      case 'tools': return <ToolsLibraryView />;
      case 'documents': return <DocumentsView documents={documents} role={profile?.role} user={user} />;
      case 'reminders': return (
        <RemindersView 
          appointments={appointments} 
          role={profile?.role} 
          notificationPermission={notificationPermission}
          onRequestNotifications={requestNotificationPermission}
        />
      );
      case 'settings': return (
        <SettingsView 
          profile={profile} 
          role={profile?.role} 
          notificationPermission={notificationPermission}
          onRequestNotifications={requestNotificationPermission}
        />
      );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-slate-900 border-r border-slate-800 p-6">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-3 mb-10 px-2 hover:opacity-80 transition-opacity text-left"
        >
          <div className="w-10 h-10">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
              }}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">MrLeeTeaches</h1>
            <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider -mt-1">Neurodiversity Coaching</p>
          </div>
        </button>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Calendar} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          <SidebarItem icon={Wrench} label="Tools Library" active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
          {profile?.role === 'coach' && (
            <>
              <SidebarItem icon={Users} label="Clients" active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
              <SidebarItem icon={Library} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
            </>
          )}
          <SidebarItem 
            icon={MessageSquare} 
            label="Messages" 
            active={activeTab === 'messages'} 
            onClick={() => setActiveTab('messages')} 
            badge={messages.filter(m => m.receiverUid === user?.uid && !m.isRead).length || undefined}
          />
          <SidebarItem icon={FileText} label="Documents" active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} />
          <SidebarItem icon={Bell} label="Reminders" active={activeTab === 'reminders'} onClick={() => setActiveTab('reminders')} />
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 font-bold overflow-hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                user.displayName?.[0] || user.email?.[0].toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.displayName || 'User'}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{profile?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 rounded-xl transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-50">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left"
        >
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="w-8 h-8 object-contain rounded-lg"
            onError={(e) => {
              e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
            }}
          />
          <div>
            <span className="font-bold text-white block leading-none">MrLeeTeaches</span>
            <span className="text-emerald-500 text-[8px] font-bold uppercase tracking-wider">Neurodiversity Coaching</span>
          </div>
        </button>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-400 hover:text-white">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-900 z-50 p-6 lg:hidden"
            >
              <div className="flex items-center justify-between mb-10">
                <button 
                  onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
                >
                  <img 
                    src="/logo.png" 
                    alt="Logo" 
                    className="w-10 h-10 object-contain rounded-xl"
                    onError={(e) => {
                      e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
                    }}
                  />
                  <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">MrLeeTeaches</h1>
                    <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider -mt-1">Neurodiversity Coaching</p>
                  </div>
                </button>
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-400">
                  <X />
                </button>
              </div>
              <nav className="space-y-2">
                <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
                <SidebarItem icon={Calendar} label="Calendar" active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setSidebarOpen(false); }} />
                <SidebarItem icon={Wrench} label="Tools Library" active={activeTab === 'tools'} onClick={() => { setActiveTab('tools'); setSidebarOpen(false); }} />
                {profile?.role === 'coach' && (
                  <>
                    <SidebarItem icon={Users} label="Clients" active={activeTab === 'clients'} onClick={() => { setActiveTab('clients'); setSidebarOpen(false); }} />
                    <SidebarItem icon={Library} label="Library" active={activeTab === 'library'} onClick={() => { setActiveTab('library'); setSidebarOpen(false); }} />
                  </>
                )}
                <SidebarItem 
                  icon={MessageSquare} 
                  label="Messages" 
                  active={activeTab === 'messages'} 
                  onClick={() => { setActiveTab('messages'); setSidebarOpen(false); }} 
                  badge={messages.filter(m => m.receiverUid === user?.uid && !m.isRead).length || undefined}
                />
                <SidebarItem icon={FileText} label="Documents" active={activeTab === 'documents'} onClick={() => { setActiveTab('documents'); setSidebarOpen(false); }} />
                <SidebarItem icon={Bell} label="Reminders" active={activeTab === 'reminders'} onClick={() => { setActiveTab('reminders'); setSidebarOpen(false); }} />
                <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }} />
              </nav>
              <div className="absolute bottom-6 left-6 right-6 pt-6 border-t border-slate-800">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-rose-400 bg-rose-400/5 rounded-xl">
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:p-8 p-4 pt-20 lg:pt-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {showPasswordChange && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
              >
                <h3 className="text-2xl font-bold text-white mb-2">Change Password</h3>
                <p className="text-slate-400 mb-6">Your coach has set a temporary password for you. Please choose a new one to continue.</p>
                
                {passwordChangeError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm p-3 rounded-xl mb-6">
                    {passwordChangeError}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">New Password</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={passwordChangeLoading}
                    className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50"
                  >
                    {passwordChangeLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Request Session Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !actionLoading && setShowRequestModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-2">Request Session</h3>
              <p className="text-slate-400 mb-6">Submit a request for a new coaching session. Stewart Lee will review and approve it.</p>
              
              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Reason for Session</label>
                  <textarea 
                    required
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Briefly describe what you'd like to discuss..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Desired Day & Time</label>
                  <input 
                    type="datetime-local" 
                    required
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowRequestModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading ? <Clock className="w-4 h-4 animate-spin" /> : null}
                    {actionLoading ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Late Notice Modal */}
      <AnimatePresence>
        {showLateNoticeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLateNoticeModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Late Notice Required</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                This appointment is scheduled to start in less than 24 hours. 
                Please get in direct contact with Stewart Lee about canceling or rescheduling.
              </p>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 mb-8">
                <p className="text-rose-400 text-sm italic">
                  Reminder: The full visit charge is still due if less than 24 hours notice is given on cancellations. 
                  Stewart Lee has discretion to waive this fee for extenuating circumstances.
                </p>
              </div>
              <button 
                onClick={() => setShowLateNoticeModal(false)}
                className="w-full py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Action Modal (Cancel/Reschedule) */}
      <AnimatePresence>
        {showActionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !actionLoading && setShowActionModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-2 capitalize">{actionType} Session</h3>
              <p className="text-slate-400 mb-6">
                {actionType === 'cancel' 
                  ? 'Are you sure you want to cancel this session? An alert will be sent to Stewart Lee.' 
                  : 'Request a new time for this session. Stewart Lee will be notified.'}
              </p>
              
              <form onSubmit={actionType === 'cancel' ? (e) => { e.preventDefault(); handleCancel(); } : handleReschedule} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Reason</label>
                  <textarea 
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Please provide a reason..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                  />
                </div>
                {actionType === 'reschedule' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Desired New Day & Time</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowActionModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button 
                    type="submit"
                    disabled={actionLoading}
                    className={cn(
                      "flex-1 py-3 text-white rounded-xl font-medium shadow-lg disabled:opacity-50 flex items-center justify-center gap-2",
                      actionType === 'cancel' ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                    )}
                  >
                    {actionLoading ? <Clock className="w-4 h-4 animate-spin" /> : null}
                    {actionLoading ? 'Processing...' : (actionType === 'cancel' ? 'Confirm Cancellation' : 'Request Reschedule')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- View Components ---

function DashboardView({ 
  appointments, 
  clients, 
  documents, 
  messages, 
  profile, 
  setActiveTab, 
  onRequestSession, 
  onAction, 
  onSelectClient,
  notificationPermission,
  onRequestNotifications
}: any) {
  const nextAppointment = useMemo(() => {
    return appointments.find((a: any) => isAfter(safeToDate(a.startTime), new Date()) && a.status === 'scheduled');
  }, [appointments]);

  const unreadCount = useMemo(() => {
    return messages.filter((m: any) => m.receiverUid === profile?.uid && !m.isRead).length;
  }, [messages, profile]);

  const stats = [
    profile?.role === 'coach' 
      ? { label: 'Active Clients', value: clients.filter((c: any) => c.isActive !== false).length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', tab: 'clients' }
      : { label: 'Shared Documents', value: documents.length, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-400/10', tab: 'documents' },
    { label: 'Upcoming Sessions', value: appointments.filter((a: any) => a.status === 'scheduled' && isAfter(safeToDate(a.startTime), new Date())).length, icon: Calendar, color: 'text-emerald-400', bg: 'bg-emerald-400/10', tab: 'calendar' },
    { label: 'New Messages', value: unreadCount, icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-400/10', tab: 'messaging' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Welcome back, {profile?.displayName?.split(' ')[0] || 'User'}</h2>
          <p className="text-slate-400 mt-1">Here's what's happening with your coaching portal today.</p>
        </div>
        {profile?.role === 'client' && (
          <button 
            onClick={onRequestSession}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" /> Request Session
          </button>
        )}
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.button
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => setActiveTab(stat.tab)}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-emerald-500/50 transition-all text-left group"
          >
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium group-hover:text-emerald-400 transition-colors">{stat.label}</p>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Next Appointment */}
        <Card 
          title="Next Appointment" 
          subtitle="Your upcoming session details"
          action={
            <button 
              onClick={() => setActiveTab('calendar')}
              className="text-emerald-500 text-sm font-medium hover:underline flex items-center gap-1"
            >
              View Calendar <ChevronRight className="w-4 h-4" />
            </button>
          }
        >
          {nextAppointment ? (
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-xl font-bold text-white">{nextAppointment.title}</h4>
                  {!isCalendarId(nextAppointment.clientEmail) && (
                    <p className="text-slate-400 text-sm mt-1">{nextAppointment.clientEmail}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="success">Scheduled</Badge>
                  <a 
                    href={getGoogleCalendarLink(nextAppointment)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-500 hover:text-emerald-400 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Calendar className="w-3 h-3" /> Add to Calendar
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="flex items-center gap-3 text-slate-300">
                  <Calendar className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm">{format(safeToDate(nextAppointment.startTime), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm">{format(safeToDate(nextAppointment.startTime), 'h:mm a')}</span>
                </div>
              </div>
              {nextAppointment.meetLink && (
                <a 
                  href={nextAppointment.meetLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-6 w-full flex items-center justify-center gap-2 bg-emerald-600/10 text-emerald-400 border border-emerald-600/20 py-3 rounded-xl hover:bg-emerald-600/20 transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> Join Google Meet
                </a>
              )}
              {profile?.role === 'client' && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button 
                    onClick={() => onAction(nextAppointment, 'reschedule')}
                    className="flex items-center justify-center gap-2 bg-slate-700/50 text-slate-300 py-2.5 rounded-xl hover:bg-slate-700 transition-all text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4" /> Reschedule
                  </button>
                  <button 
                    onClick={() => onAction(nextAppointment, 'cancel')}
                    className="flex items-center justify-center gap-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 py-2.5 rounded-xl hover:bg-rose-500/20 transition-all text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" /> Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700">
              <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No upcoming sessions scheduled.</p>
            </div>
          )}
        </Card>

        {/* Recent Activity / Quick Actions */}
        <Card 
          title={profile?.role === 'coach' ? "Client Overview" : "Recent Documents"} 
          subtitle={profile?.role === 'coach' ? "Manage your registered clients" : "Latest shared materials"}
          action={
            <button 
              onClick={() => setActiveTab(profile?.role === 'coach' ? 'clients' : 'documents')}
              className="text-emerald-500 text-sm font-medium hover:underline flex items-center gap-1"
            >
              {profile?.role === 'coach' ? 'Manage Clients' : 'View All'} <ChevronRight className="w-4 h-4" />
            </button>
          }
        >
          <div className="space-y-4">
            {profile?.role === 'coach' ? (
              clients.slice(0, 4).map((client: any) => (
                <button 
                  key={client.uid} 
                  onClick={() => onSelectClient(client)}
                  className="w-full flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30 hover:bg-slate-800/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                      {client.displayName[0]}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{client.displayName}</p>
                      <p className="text-xs text-slate-500">{client.email}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              ))
            ) : (
              documents.slice(0, 4).map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30 hover:bg-slate-800/50 transition-all group">
                  <a 
                    href={doc.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-emerald-400 transition-colors">{doc.name}</p>
                      <p className="text-xs text-slate-500">{format(safeToDate(doc.createdAt), 'MMM d')}</p>
                    </div>
                  </a>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-white shrink-0">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))
            )}
            {((profile?.role === 'coach' && clients.length === 0) || (profile?.role === 'client' && documents.length === 0)) && (
              <p className="text-center py-8 text-slate-600 text-sm italic">Nothing to show yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CalendarView({ appointments, role, onAction }: any) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  
  const dayAppointments = useMemo(() => {
    return appointments.filter((a: any) => {
      const date = safeToDate(a.startTime);
      return isSameDay(date, selectedDate);
    });
  }, [appointments, selectedDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    const end = endOfWeek(selectedDate);
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Coaching Calendar</h2>
          <p className="text-slate-400 mt-1">Manage and view your scheduled sessions.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex">
            <button 
              onClick={() => setViewMode('day')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                viewMode === 'day' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "text-slate-400 hover:text-white"
              )}
            >
              Daily
            </button>
            <button 
              onClick={() => setViewMode('week')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                viewMode === 'week' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "text-slate-400 hover:text-white"
              )}
            >
              Weekly
            </button>
          </div>
          {role === 'coach' && (
            <button 
              onClick={async () => {
                try {
                  await fetch('/api/sync-calendar', { method: 'POST' });
                  alert('Sync initiated! Refreshing in a moment...');
                } catch (e) {
                  console.error(e);
                }
              }}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-500 transition-colors"
            >
              <Plus className="w-4 h-4" /> Sync Calendar
            </button>
          )}
        </div>
      </header>

      {viewMode === 'day' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Simple Calendar Picker Placeholder */}
          <Card title="Select Date" className="lg:col-span-1">
            <div className="space-y-4">
              <input 
                type="date" 
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  setSelectedDate(new Date(year, month - 1, day));
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <p className="text-sm text-slate-400 mb-2">Selected Date</p>
                <p className="text-lg font-bold text-white">{format(selectedDate, 'EEEE, MMMM do')}</p>
              </div>
            </div>
          </Card>

          {/* Appointments List for Day */}
          <Card title={`Sessions for ${format(selectedDate, 'MMM d')}`} className="lg:col-span-2">
            <div className="space-y-4">
              {dayAppointments.length > 0 ? (
                dayAppointments.map((appt: any) => (
                  <AppointmentCard key={appt.id} appt={appt} role={role} onAction={onAction} />
                ))
              ) : (
                <div className="text-center py-20 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                  <Clock className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                  <p className="text-slate-600">No sessions scheduled for this day.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <button 
              onClick={() => setSelectedDate(addHours(selectedDate, -24 * 7))}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <h3 className="text-lg font-bold text-white">
              {format(startOfWeek(selectedDate), 'MMM d')} — {format(endOfWeek(selectedDate), 'MMM d, yyyy')}
            </h3>
            <button 
              onClick={() => setSelectedDate(addHours(selectedDate, 24 * 7))}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map((day) => {
              const dayAppts = appointments.filter((a: any) => isSameDay(safeToDate(a.startTime), day));
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);

              return (
                <div 
                  key={day.toString()} 
                  className={cn(
                    "flex flex-col min-h-[200px] bg-slate-900 border rounded-2xl overflow-hidden transition-all",
                    isToday ? "border-emerald-500/50 shadow-lg shadow-emerald-500/5" : "border-slate-800",
                    isSelected && !isToday ? "border-slate-600" : ""
                  )}
                >
                  <div className={cn(
                    "p-3 text-center border-b",
                    isToday ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-800/30 border-slate-800"
                  )}>
                    <p className={cn("text-[10px] font-bold uppercase tracking-wider", isToday ? "text-emerald-400" : "text-slate-500")}>
                      {format(day, 'EEE')}
                    </p>
                    <p className={cn("text-lg font-bold", isToday ? "text-white" : "text-slate-300")}>
                      {format(day, 'd')}
                    </p>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[300px]">
                    {dayAppts.length > 0 ? (
                      dayAppts.map((appt: any) => (
                        <button
                          key={appt.id}
                          onClick={() => {
                            setSelectedDate(day);
                            setViewMode('day');
                          }}
                          className="w-full text-left p-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-all group"
                        >
                          <p className="text-[10px] font-bold text-emerald-500 mb-0.5">{format(safeToDate(appt.startTime), 'h:mm a')}</p>
                          <p className="text-xs font-medium text-white truncate group-hover:text-emerald-400">{appt.title}</p>
                        </button>
                      ))
                    ) : (
                      <div className="h-full flex items-center justify-center opacity-20">
                        <Clock className="w-4 h-4 text-slate-500" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ appt, role, onAction }: any) {
  return (
    <div className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-2xl p-5 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex gap-4">
          <div className="flex flex-col items-center justify-center w-16 h-16 bg-slate-900 rounded-xl border border-slate-700">
            <span className="text-xs font-bold text-emerald-500 uppercase">{format(safeToDate(appt.startTime), 'h:mm')}</span>
            <span className="text-xs text-slate-500">{format(safeToDate(appt.startTime), 'a')}</span>
          </div>
          <div>
            <h4 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">{appt.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              {!isCalendarId(appt.clientEmail) && (
                <>
                  <Mail className="w-3 h-3 text-slate-500" />
                  <span className="text-xs text-slate-400">{appt.clientEmail}</span>
                </>
              )}
              <a 
                href={getGoogleCalendarLink(appt)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase flex items-center gap-1 ml-2"
              >
                <Calendar className="w-3 h-3" /> Add to Calendar
              </a>
              {appt.meetLink && (
                <a 
                  href={appt.meetLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 ml-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase">Meet</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <Badge variant={appt.status === 'scheduled' ? 'success' : 'default'}>
          {appt.status}
        </Badge>
      </div>
      {appt.description && (
        <p className="text-sm text-slate-500 mt-4 pl-20 border-l-2 border-slate-700 italic">
          {appt.description}
        </p>
      )}
      {role === 'client' && appt.status === 'scheduled' && (
        <div className="flex gap-3 mt-4 pl-20">
          <button 
            onClick={() => onAction(appt, 'reschedule')}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider"
          >
            <RefreshCw className="w-3 h-3" /> Reschedule
          </button>
          <button 
            onClick={() => onAction(appt, 'cancel')}
            className="flex items-center gap-2 text-xs font-bold text-rose-500/70 hover:text-rose-400 transition-colors uppercase tracking-wider"
          >
            <Trash2 className="w-3 h-3" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function CoachNotesSection({ clientUid }: { clientUid: string }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'coach_notes', clientUid), (docSnap) => {
      if (docSnap.exists()) {
        setNote(docSnap.data().content);
      } else {
        setNote('');
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `coach_notes/${clientUid}`);
      setLoading(false);
    });
    return () => unsub();
  }, [clientUid]);

  const handleSave = async () => {
    if (loading) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'coach_notes', clientUid), {
        clientUid,
        content: note,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `coach_notes/${clientUid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-800/20 rounded-2xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Private Coach Notes</h4>
        {loading ? (
          <span className="text-[10px] text-slate-600 animate-pulse uppercase font-bold">Loading...</span>
        ) : saving ? (
          <span className="text-[10px] text-emerald-500 animate-pulse uppercase font-bold">Saving...</span>
        ) : (
          <span className="text-[10px] text-slate-600 uppercase font-bold">Auto-saves on blur</span>
        )}
      </div>
      {loading ? (
        <div className="w-full h-[150px] bg-slate-900/50 border border-slate-700 rounded-xl animate-pulse" />
      ) : (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleSave}
          placeholder="Add private notes about this client here... (Not visible to client)"
          className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[150px] resize-none"
        />
      )}
    </div>
  );
}

function PrivateNotesSection({ clientUid, clientEmail, appointments }: { clientUid: string, clientEmail: string, appointments: any[] }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [selectedApptId, setSelectedApptId] = useState('');
  const [noteTitle, setNoteTitle] = useState('');

  const fetchNotes = async () => {
    try {
      const res = await fetch(`/api/private-notes/${clientUid}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch (err) {
      console.error('Failed to fetch private notes:', err);
    }
  };

  const fetchDriveFiles = async () => {
    try {
      const res = await fetch(`/api/drive/private-notes/${clientUid}`);
      if (res.ok) {
        const data = await res.json();
        setDriveFiles(data);
      }
    } catch (err) {
      console.error('Failed to fetch drive files:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchNotes(), fetchDriveFiles()]).finally(() => setLoading(false));
  }, [clientUid]);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const response = await fetch('/api/drive/private-notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientUid,
          title: noteTitle,
          appointmentId: selectedApptId || null
        })
      });

      if (!response.ok) throw new Error('Failed to create note');

      await fetchNotes();
      await fetchDriveFiles();
      setShowNewNoteModal(false);
      setNoteTitle('');
      setSelectedApptId('');
    } catch (err) {
      console.error('Create note error:', err);
    } finally {
      setCreating(false);
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFiles = driveFiles.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !notes.some(n => n.driveFileId === f.id)
  );

  const clientAppts = appointments
    .filter(a => a.clientEmail === clientEmail)
    .sort((a, b) => safeToDate(b.startTime).getTime() - safeToDate(a.startTime).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Private Session Notes & Files</h4>
        <button 
          onClick={() => setShowNewNoteModal(true)}
          className="flex items-center gap-2 text-xs font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" /> New Session Note
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input 
          type="text" 
          placeholder="Search notes and files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-800/20 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => (
            <div key={note.id} className="bg-slate-800/20 rounded-xl border border-slate-800 p-4 flex items-center justify-between group hover:border-emerald-500/30 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{note.title}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {note.createdAt ? format(safeToDate(note.createdAt), 'MMM d, yyyy') : 'Recently Created'}
                  </p>
                </div>
              </div>
              <a 
                href={note.webViewLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ))}

          {filteredFiles.map(file => (
            <div key={file.id} className="bg-slate-800/10 rounded-xl border border-dashed border-slate-800 p-4 flex items-center justify-between group hover:border-slate-700 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-500/10 flex items-center justify-center text-slate-500">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-slate-300 font-medium text-sm">{file.name}</p>
                  <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">
                    {format(new Date(file.modifiedTime), 'MMM d, yyyy')} • Drive File
                  </p>
                </div>
              </div>
              <a 
                href={file.webViewLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 bg-slate-800/50 text-slate-500 rounded-lg hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ))}

          {filteredNotes.length === 0 && filteredFiles.length === 0 && (
            <div className="text-center py-8 bg-slate-800/5 rounded-2xl border border-dashed border-slate-800">
              <p className="text-slate-500 text-sm">No private notes or files found.</p>
            </div>
          )}
        </div>
      )}

      {/* New Note Modal */}
      <AnimatePresence>
        {showNewNoteModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !creating && setShowNewNoteModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-2">New Session Note</h3>
              <p className="text-slate-400 mb-6">Create a private Google Doc for this session.</p>

              <form onSubmit={handleCreateNote} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Associate with Appointment</label>
                  <select 
                    value={selectedApptId}
                    onChange={(e) => {
                      const apptId = e.target.value;
                      setSelectedApptId(apptId);
                      const appt = clientAppts.find(a => a.id === apptId);
                      if (appt) {
                        setNoteTitle(`Session Note - ${format(safeToDate(appt.startTime), 'yyyy-MM-dd')}`);
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select an appointment...</option>
                    {clientAppts.map(appt => (
                      <option key={appt.id} value={appt.id}>
                        {format(safeToDate(appt.startTime), 'MMM d, yyyy')} - {appt.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Note Title</label>
                  <input 
                    type="text" 
                    required
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="e.g., Session Note - 2026-03-27"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    disabled={creating}
                    onClick={() => setShowNewNoteModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={creating || !noteTitle}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {creating ? <Clock className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {creating ? 'Creating...' : 'Create Note'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OnboardingView({ user, onComplete }: { user: User, onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: user.email || '',
    phone: '',
    preferredName: '',
    age: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    prompt: '',
    challenges: [] as string[],
    otherChallenge: '',
    duration: '',
    formalDiagnosis: '',
    seeingTherapist: '',
    strengths: '',
    frequency: '',
    schedulingConstraints: '',
    anythingElse: '',
    agreedToTerms: false,
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    secondaryParentName: '',
    secondaryParentPhone: '',
    secondaryParentEmail: ''
  });

  const challengesOptions = [
    "Homework initiation",
    "Organization / losing materials",
    "Time management",
    "Emotional shutdown",
    "School/Work Avoidance",
    "Transitions",
    "Follow-through"
  ];

  const handleChallengeToggle = (option: string) => {
    setFormData(prev => ({
      ...prev,
      challenges: prev.challenges.includes(option)
        ? prev.challenges.filter(c => c !== option)
        : [...prev.challenges, option]
    }));
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const title = "Stewart Lee Coaching - Intake Form Responses";
    
    doc.setFontSize(20);
    doc.text(title, 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Client: ${formData.name}`, 20, 30);
    doc.text(`Email: ${formData.email}`, 20, 35);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 40);

    const tableData = [
      ["Question", "Response"],
      ["Preferred Name", formData.preferredName || "N/A"],
      ["Phone Number", formData.phone],
      ["Age", formData.age],
      ["Parent/Guardian Name", formData.parentName || "N/A"],
      ["Parent/Guardian Phone", formData.parentPhone || "N/A"],
      ["Parent/Guardian Email", formData.parentEmail || "N/A"],
      ["Secondary Parent/Guardian", formData.secondaryParentName ? `${formData.secondaryParentName} (${formData.secondaryParentPhone}, ${formData.secondaryParentEmail})` : "N/A"],
      ["Emergency Contact", `${formData.emergencyContactName} (${formData.emergencyContactPhone})`],
      ["Prompt for Support", formData.prompt],
      ["Current Challenges", formData.challenges.join(", ") + (formData.otherChallenge ? `, Other: ${formData.otherChallenge}` : "")],
      ["Challenge Duration", formData.duration],
      ["Formal Diagnosis", formData.formalDiagnosis || "None shared"],
      ["Seeing Therapist?", formData.seeingTherapist],
      ["Strengths", formData.strengths],
      ["Preferred Frequency", formData.frequency],
      ["Scheduling Constraints", formData.schedulingConstraints],
      ["Additional Info", formData.anythingElse || "N/A"],
      ["Agreed to Terms", "Yes"]
    ];

    autoTable(doc, {
      startY: 50,
      head: [tableData[0]],
      body: tableData.slice(1),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] } // Emerald-500
    });

    return doc.output('blob');
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const pdfBlob = generatePDF();
      const reader = new FileReader();
      reader.readAsDataURL(pdfBlob);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        const response = await fetch('/api/onboarding/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientUid: user.uid,
            onboardingData: formData,
            pdfBase64: base64data
          })
        });

        if (response.ok) {
          onComplete();
        } else {
          throw new Error('Failed to submit onboarding');
        }
      };
    } catch (err) {
      console.error('Onboarding error:', err);
      alert('Failed to submit onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isStepValid = () => {
    const age = parseInt(formData.age);
    switch(step) {
      case 1: 
        if (!formData.name || !formData.phone || !formData.age) return false;
        if (age < 13) return false;
        if (age >= 13 && age <= 17) {
          return formData.parentName && formData.parentPhone && formData.parentEmail;
        }
        return true;
      case 2: return formData.emergencyContactName && formData.emergencyContactPhone;
      case 3: return formData.prompt && (formData.challenges.length > 0 || formData.otherChallenge) && formData.duration;
      case 4: return formData.seeingTherapist;
      case 5: return formData.strengths && formData.frequency && formData.schedulingConstraints;
      case 6: return formData.agreedToTerms;
      default: return false;
    }
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        const age = parseInt(formData.age);
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Basic Information</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Full Name *</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number *</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                placeholder="864-209-1043"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Age *</label>
                <input 
                  type="number" 
                  value={formData.age}
                  onChange={e => setFormData({...formData, age: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  placeholder="25"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Preferred Name</label>
                <input 
                  type="text" 
                  value={formData.preferredName}
                  onChange={e => setFormData({...formData, preferredName: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  placeholder="Johnny"
                />
              </div>
            </div>

            {age > 0 && age < 13 && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                <p className="text-rose-400 text-sm font-medium">
                  We're sorry, but users under 13 cannot create an account directly. 
                  Please have your parent or guardian contact Stewart Lee at <a href="mailto:coach@mrleeteaches.com" className="underline font-bold">coach@mrleeteaches.com</a> to discuss coaching options.
                </p>
              </div>
            )}

            {age >= 13 && age <= 17 && (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                  <p className="text-emerald-400 text-sm font-medium">
                    Note: For clients between 13 and 17, a parent or guardian will be the primary point of contact unless other arrangements have been made with Stewart Lee personally.
                  </p>
                </div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Parent/Guardian Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name *</label>
                    <input 
                      type="text" 
                      value={formData.parentName}
                      onChange={e => setFormData({...formData, parentName: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone *</label>
                    <input 
                      type="tel" 
                      value={formData.parentPhone}
                      onChange={e => setFormData({...formData, parentPhone: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email *</label>
                  <input 
                    type="email" 
                    value={formData.parentEmail}
                    onChange={e => setFormData({...formData, parentEmail: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-2">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Secondary Parent/Guardian (Optional)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name</label>
                      <input 
                        type="text" 
                        value={formData.secondaryParentName}
                        onChange={e => setFormData({...formData, secondaryParentName: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone</label>
                      <input 
                        type="tel" 
                        value={formData.secondaryParentPhone}
                        onChange={e => setFormData({...formData, secondaryParentPhone: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email</label>
                    <input 
                      type="email" 
                      value={formData.secondaryParentEmail}
                      onChange={e => setFormData({...formData, secondaryParentEmail: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Emergency Contact</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contact Name *</label>
              <input 
                type="text" 
                value={formData.emergencyContactName}
                onChange={e => setFormData({...formData, emergencyContactName: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contact Phone Number *</label>
              <input 
                type="tel" 
                value={formData.emergencyContactPhone}
                onChange={e => setFormData({...formData, emergencyContactPhone: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Current Concerns</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">What prompted you to seek support right now? *</label>
              <textarea 
                value={formData.prompt}
                onChange={e => setFormData({...formData, prompt: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">What feels most challenging at the moment? *</label>
              <div className="grid grid-cols-1 gap-2">
                {challengesOptions.map(option => (
                  <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                    <input 
                      type="checkbox"
                      checked={formData.challenges.includes(option)}
                      onChange={() => handleChallengeToggle(option)}
                      className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span className="text-sm text-slate-300">{option}</span>
                  </label>
                ))}
                <div className="mt-2">
                  <input 
                    type="text" 
                    placeholder="Other..."
                    value={formData.otherChallenge}
                    onChange={e => setFormData({...formData, otherChallenge: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">How long have these challenges been present? *</label>
              <input 
                type="text" 
                value={formData.duration}
                onChange={e => setFormData({...formData, duration: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Background Information</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Have you received any formal diagnosis?</label>
              <textarea 
                value={formData.formalDiagnosis}
                onChange={e => setFormData({...formData, formalDiagnosis: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                placeholder="Please share if you feel comfortable doing so."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Are you currently seeing a therapist or counselor? *</label>
              <div className="space-y-2">
                {["Yes", "No", "Looking for one or looking for a new one"].map(option => (
                  <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                    <input 
                      type="radio"
                      name="therapist"
                      checked={formData.seeingTherapist === option}
                      onChange={() => setFormData({...formData, seeingTherapist: option})}
                      className="w-4 h-4 border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span className="text-sm text-slate-300">{option}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Coaching Preferences</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Is there anything important I should know about your strengths? *</label>
              <textarea 
                value={formData.strengths}
                onChange={e => setFormData({...formData, strengths: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Preferred session frequency: *</label>
              <div className="grid grid-cols-2 gap-2">
                {["Weekly", "Biweekly", "Monthly", "As needed basis"].map(option => (
                  <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                    <input 
                      type="radio"
                      name="frequency"
                      checked={formData.frequency === option}
                      onChange={() => setFormData({...formData, frequency: option})}
                      className="w-4 h-4 border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span className="text-sm text-slate-300">{option}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Any scheduling constraints? *</label>
              <textarea 
                value={formData.schedulingConstraints}
                onChange={e => setFormData({...formData, schedulingConstraints: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Is there anything else that you feel I should be aware of?</label>
              <textarea 
                value={formData.anythingElse}
                onChange={e => setFormData({...formData, anythingElse: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
              />
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white">Legal Agreements</h3>
            <div className="p-6 bg-slate-800/30 border border-slate-800 rounded-2xl space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Please Note: Coaching is not therapy and is not a substitute for mental health treatment. If concerns arise that are outside the scope of coaching, referrals may be recommended.
              </p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                  <input 
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={e => setFormData({...formData, agreedToTerms: e.target.checked})}
                    className="mt-1 w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                  />
                  <span className="text-sm text-slate-300">
                    I have read and agree to the <a href="https://mrleeteaches.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">Privacy Policy</a> and <a href="https://mrleeteaches.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">Terms & Conditions</a>. *
                  </span>
                </label>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-8 md:p-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Welcome to Coaching</h2>
              <p className="text-slate-400">Please complete your onboarding intake form.</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <FileCheck className="w-8 h-8" />
            </div>
          </div>

          <div className="flex gap-2 mb-12">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div 
                key={i} 
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-emerald-500' : 'bg-slate-800'}`}
              />
            ))}
          </div>

          <div className="min-h-[400px]">
            {renderStep()}
          </div>

          <div className="flex gap-4 mt-12">
            {step > 1 && (
              <button 
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 px-6 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
            )}
            {step < 6 ? (
              <button 
                disabled={!isStepValid()}
                onClick={() => setStep(step + 1)}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                Next <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                disabled={!isStepValid() || loading}
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                {loading ? 'Submitting...' : 'Complete Onboarding'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ClientsView({ clients, appointments, documents, role, selectedClient, setSelectedClient }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [createdClientPassword, setCreatedClientPassword] = useState<string | null>(null);
  const [inviteAge, setInviteAge] = useState('');
  const [inviteEmergencyContactName, setInviteEmergencyContactName] = useState('');
  const [inviteEmergencyContactPhone, setInviteEmergencyContactPhone] = useState('');
  const [inviteFormalDiagnosis, setInviteFormalDiagnosis] = useState('');
  const [inviteSchedulingConstraints, setInviteSchedulingConstraints] = useState('');
  const [inviteParentName, setInviteParentName] = useState('');
  const [inviteParentPhone, setInviteParentPhone] = useState('');
  const [inviteParentEmail, setInviteParentEmail] = useState('');
  const [inviteSecondaryParentName, setInviteSecondaryParentName] = useState('');
  const [inviteSecondaryParentPhone, setInviteSecondaryParentPhone] = useState('');
  const [inviteSecondaryParentEmail, setInviteSecondaryParentEmail] = useState('');
  const [invitePreferredName, setInvitePreferredName] = useState('');
  const [invitePrompt, setInvitePrompt] = useState('');
  const [inviteChallenges, setInviteChallenges] = useState<string[]>([]);
  const [inviteOtherChallenge, setInviteOtherChallenge] = useState('');
  const [inviteDuration, setInviteDuration] = useState('');
  const [inviteSeeingTherapist, setInviteSeeingTherapist] = useState('');
  const [inviteStrengths, setInviteStrengths] = useState('');
  const [inviteFrequency, setInviteFrequency] = useState('');
  const [inviteAnythingElse, setInviteAnythingElse] = useState('');
  const [showOnboardingFields, setShowOnboardingFields] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const filteredClients = clients.filter((c: any) => {
    const matchesSearch = c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || 
                          (filter === 'active' && c.isActive !== false) || 
                          (filter === 'inactive' && c.isActive === false);
    return matchesSearch && matchesFilter;
  });

  const toggleClientStatus = async (client: any) => {
    try {
      await updateDoc(doc(db, 'users', client.uid), {
        isActive: client.isActive === false ? true : false
      });
    } catch (err: any) {
      console.error('Failed to toggle client status:', err);
      setError('Failed to update client status');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    setError(null);
    try {
      const onboardingData: any = {};
      if (showOnboardingFields) {
        if (inviteAge) onboardingData.age = parseInt(inviteAge);
        if (invitePreferredName) onboardingData.preferredName = invitePreferredName;
        if (inviteEmergencyContactName) onboardingData.emergencyContactName = inviteEmergencyContactName;
        if (inviteEmergencyContactPhone) onboardingData.emergencyContactPhone = inviteEmergencyContactPhone;
        if (inviteFormalDiagnosis) onboardingData.formalDiagnosis = inviteFormalDiagnosis;
        if (inviteSchedulingConstraints) onboardingData.schedulingConstraints = inviteSchedulingConstraints;
        if (invitePrompt) onboardingData.prompt = invitePrompt;
        if (inviteChallenges.length > 0) onboardingData.challenges = inviteChallenges;
        if (inviteOtherChallenge) onboardingData.otherChallenge = inviteOtherChallenge;
        if (inviteDuration) onboardingData.duration = inviteDuration;
        if (inviteSeeingTherapist) onboardingData.seeingTherapist = inviteSeeingTherapist;
        if (inviteStrengths) onboardingData.strengths = inviteStrengths;
        if (inviteFrequency) onboardingData.frequency = inviteFrequency;
        if (inviteAnythingElse) onboardingData.anythingElse = inviteAnythingElse;
        if (inviteParentName) onboardingData.parentName = inviteParentName;
        if (inviteParentPhone) onboardingData.parentPhone = inviteParentPhone;
        if (inviteParentEmail) onboardingData.parentEmail = inviteParentEmail;
        if (inviteSecondaryParentName) onboardingData.secondaryParentName = inviteSecondaryParentName;
        if (inviteSecondaryParentPhone) onboardingData.secondaryParentPhone = inviteSecondaryParentPhone;
        if (inviteSecondaryParentEmail) onboardingData.secondaryParentEmail = inviteSecondaryParentEmail;
      }

      const response = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: inviteEmail, 
          displayName: inviteName, 
          phone: invitePhone,
          password: invitePassword || undefined,
          ...onboardingData
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create client');
      }

      setCreatedClientPassword(data.tempPassword);
      setSuccessMessage(`Client ${inviteName} has been created. ${data.tempPassword ? `Temporary password: ${data.tempPassword}` : ''} An invitation email has also been sent to ${inviteEmail}.`);
      setInviteEmail('');
      setInviteName('');
      setInvitePhone('');
      setInvitePassword('');
      setInviteAge('');
      setInviteEmergencyContactName('');
      setInviteEmergencyContactPhone('');
      setInviteFormalDiagnosis('');
      setInviteSchedulingConstraints('');
      setInviteParentName('');
      setInviteParentPhone('');
      setInviteParentEmail('');
      setInviteSecondaryParentName('');
      setInviteSecondaryParentPhone('');
      setInviteSecondaryParentEmail('');
      setInvitePreferredName('');
      setInvitePrompt('');
      setInviteChallenges([]);
      setInviteOtherChallenge('');
      setInviteDuration('');
      setInviteSeeingTherapist('');
      setInviteStrengths('');
      setInviteFrequency('');
      setInviteAnythingElse('');
      setShowOnboardingFields(false);
      setShowInviteModal(false);
    } catch (err: any) {
      console.error('Invitation error:', err);
      setError(err.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setIsInviting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update client');
      }

      setSuccessMessage('Client profile updated successfully.');
      setIsEditing(false);
      setEditData(null);
    } catch (err: any) {
      console.error('Update error:', err);
      setError(err.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendWelcome = async (uid: string) => {
    try {
      const response = await fetch('/api/admin/resend-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resend email');
      }
      setSuccessMessage('Welcome email has been resent.');
    } catch (err: any) {
      console.error('Resend error:', err);
      setError(err.message);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    try {
      const response = await fetch(`/api/admin/delete-client/${clientToDelete.uid}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete client');
      }

      setSuccessMessage('Client deleted successfully.');
      setClientToDelete(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete client');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Client Directory</h2>
          <p className="text-slate-400 mt-1">Manage your registered and external coaching clients.</p>
        </div>
        <button 
          onClick={() => {
            setError(null);
            setShowInviteModal(true);
          }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-500 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Add Client
        </button>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex bg-slate-900 border border-slate-800 rounded-2xl p-1">
          {(['active', 'inactive', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all ${
                filter === f ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredClients.map((client: any) => {
          const clientAppts = appointments.filter((a: any) => a.clientEmail === client.email);
          return (
            <motion.div
              key={client.uid}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl group hover:border-emerald-500/50 transition-all"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-xl">
                  {client.displayName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-white truncate">{client.displayName}</h4>
                  <p className="text-sm text-slate-500 truncate">{client.email}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                    client.isActive !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
                  }`}>
                    {client.isActive !== false ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleClientStatus(client);
                    }}
                    className={`w-10 h-6 rounded-full relative transition-colors ${
                      client.isActive !== false ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                      client.isActive !== false ? 'left-5' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Sessions</p>
                  <p className="text-lg font-bold text-white">{clientAppts.length}</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Joined</p>
                  <p className="text-sm font-bold text-white">{client.createdAt ? format(safeToDate(client.createdAt), 'MMM yyyy') : 'N/A'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedClient(client)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  View Profile <ChevronRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditData({ ...client });
                    setIsEditing(true);
                  }}
                  className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-colors"
                  title="Edit Profile"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResendWelcome(client.uid);
                  }}
                  className="p-3 bg-blue-500/10 text-blue-500 rounded-xl hover:bg-blue-500/20 transition-colors"
                  title="Resend Welcome Email"
                >
                  <Mail className="w-5 h-5" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setClientToDelete(client);
                  }}
                  className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500/20 transition-colors"
                  title="Delete Client"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Edit Client Modal */}
      <AnimatePresence>
        {isEditing && editData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isInviting && setIsEditing(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-bold text-white mb-2">Edit Client Profile</h3>
              <p className="text-slate-400 mb-6">Update client information and onboarding data.</p>
              
              {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm whitespace-pre-wrap">
                  {error}
                </div>
              )}

              <form onSubmit={handleUpdateClient} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={editData.displayName || ''}
                      onChange={(e) => setEditData({ ...editData, displayName: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Email Address (Read Only)</label>
                    <input 
                      type="email" 
                      disabled
                      value={editData.email || ''}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Phone Number</label>
                  <input 
                    type="tel" 
                    value={editData.phoneNumber || ''}
                    onChange={(e) => setEditData({ ...editData, phoneNumber: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Onboarding Information</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Age</label>
                        <input 
                          type="number" 
                          value={editData.age || ''}
                          onChange={(e) => setEditData({ ...editData, age: parseInt(e.target.value) || '' })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Preferred Name</label>
                        <input 
                          type="text" 
                          value={editData.preferredName || ''}
                          onChange={(e) => setEditData({ ...editData, preferredName: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Emergency Contact Name</label>
                        <input 
                          type="text" 
                          value={editData.emergencyContactName || ''}
                          onChange={(e) => setEditData({ ...editData, emergencyContactName: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Emergency Contact Phone</label>
                        <input 
                          type="tel" 
                          value={editData.emergencyContactPhone || ''}
                          onChange={(e) => setEditData({ ...editData, emergencyContactPhone: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">What prompted you to seek support right now?</label>
                      <textarea 
                        value={editData.prompt || ''}
                        onChange={(e) => setEditData({ ...editData, prompt: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Current Challenges</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {[
                          "Homework initiation",
                          "Organization / losing materials",
                          "Time management",
                          "Emotional shutdown",
                          "School/Work Avoidance",
                          "Transitions",
                          "Follow-through"
                        ].map(option => (
                          <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                            <input 
                              type="checkbox"
                              checked={(editData.challenges || []).includes(option)}
                              onChange={() => {
                                const current = editData.challenges || [];
                                const next = current.includes(option) ? current.filter((c: string) => c !== option) : [...current, option];
                                setEditData({ ...editData, challenges: next });
                              }}
                              className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                            />
                            <span className="text-sm text-slate-300">{option}</span>
                          </label>
                        ))}
                      </div>
                      <input 
                        type="text" 
                        placeholder="Other..."
                        value={editData.otherChallenge || ''}
                        onChange={e => setEditData({ ...editData, otherChallenge: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 mt-2"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">How long have these challenges been present?</label>
                      <input 
                        type="text" 
                        value={editData.duration || ''}
                        onChange={(e) => setEditData({ ...editData, duration: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Formal Diagnosis</label>
                      <textarea 
                        value={editData.formalDiagnosis || ''}
                        onChange={(e) => setEditData({ ...editData, formalDiagnosis: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Are you currently seeing a therapist or counselor?</label>
                      <div className="space-y-2">
                        {["Yes", "No", "Looking for one or looking for a new one"].map(option => (
                          <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                            <input 
                              type="radio"
                              name="editTherapist"
                              checked={editData.seeingTherapist === option}
                              onChange={() => setEditData({ ...editData, seeingTherapist: option })}
                              className="w-4 h-4 border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                            />
                            <span className="text-sm text-slate-300">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Important info about strengths</label>
                      <textarea 
                        value={editData.strengths || ''}
                        onChange={(e) => setEditData({ ...editData, strengths: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Preferred session frequency</label>
                      <div className="grid grid-cols-2 gap-2">
                        {["Weekly", "Biweekly", "Monthly", "As needed basis"].map(option => (
                          <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                            <input 
                              type="radio"
                              name="editFrequency"
                              checked={editData.frequency === option}
                              onChange={() => setEditData({ ...editData, frequency: option })}
                              className="w-4 h-4 border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                            />
                            <span className="text-sm text-slate-300">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Scheduling Constraints</label>
                      <textarea 
                        value={editData.schedulingConstraints || ''}
                        onChange={(e) => setEditData({ ...editData, schedulingConstraints: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Anything else?</label>
                      <textarea 
                        value={editData.anythingElse || ''}
                        onChange={(e) => setEditData({ ...editData, anythingElse: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                      />
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Parent/Guardian Info (For Minors)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Parent Name</label>
                          <input 
                            type="text" 
                            value={editData.parentName || ''}
                            onChange={(e) => setEditData({ ...editData, parentName: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Parent Phone</label>
                          <input 
                            type="tel" 
                            value={editData.parentPhone || ''}
                            onChange={(e) => setEditData({ ...editData, parentPhone: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Parent Email</label>
                        <input 
                          type="email" 
                          value={editData.parentEmail || ''}
                          onChange={(e) => setEditData({ ...editData, parentEmail: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-800/50">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Secondary Parent/Guardian (Optional)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Name</label>
                            <input 
                              type="text" 
                              value={editData.secondaryParentName || ''}
                              onChange={(e) => setEditData({ ...editData, secondaryParentName: e.target.value })}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Phone</label>
                            <input 
                              type="tel" 
                              value={editData.secondaryParentPhone || ''}
                              onChange={(e) => setEditData({ ...editData, secondaryParentPhone: e.target.value })}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Email</label>
                          <input 
                            type="email" 
                            value={editData.secondaryParentEmail || ''}
                            onChange={(e) => setEditData({ ...editData, secondaryParentEmail: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    disabled={isInviting}
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isInviting}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isInviting ? <Clock className="w-4 h-4 animate-spin" /> : null}
                    {isInviting ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {clientToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setClientToDelete(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Delete Client?</h3>
              <p className="text-slate-400 text-center mb-8">
                Are you sure you want to delete <span className="text-white font-bold">{clientToDelete.displayName}</span>? 
                This will remove their account and portal access. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setClientToDelete(null)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteClient}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {successMessage && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSuccessMessage(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Success</h3>
              <p className="text-slate-400 mb-8">{successMessage}</p>
              {createdClientPassword && (
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(createdClientPassword);
                    alert('Password copied to clipboard!');
                  }}
                  className="w-full py-3 mb-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" /> Copy Password
                </button>
              )}
              <button 
                onClick={() => {
                  setSuccessMessage(null);
                  setCreatedClientPassword(null);
                }}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 transition-colors"
              >
                Continue
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {selectedClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedClient(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-3xl">
                  {selectedClient.displayName?.[0] || '?'}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white">
                    {selectedClient.displayName}
                    {selectedClient.preferredName && (
                      <span className="text-slate-500 font-normal ml-2 text-lg">({selectedClient.preferredName})</span>
                    )}
                  </h3>
                  <p className="text-slate-400">{selectedClient.email}</p>
                  {selectedClient.phone && <p className="text-slate-400 text-sm mt-1">{selectedClient.phone}</p>}
                </div>
                <button 
                  onClick={() => {
                    setEditData({ ...selectedClient });
                    setIsEditing(true);
                    setSelectedClient(null);
                  }}
                  className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Role</p>
                  <p className="text-white font-medium capitalize">{selectedClient.role}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Joined</p>
                  <p className="text-white font-medium">
                    {selectedClient.createdAt ? format(safeToDate(selectedClient.createdAt), 'MMMM d, yyyy') : 'N/A'}
                  </p>
                </div>
              </div>

              {selectedClient.isOnboarded && (
                <div className="mb-8 space-y-6">
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Onboarding Information</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Age</p>
                        <p className="text-white font-medium">{selectedClient.age || 'N/A'}</p>
                      </div>
                      <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Preferred Name</p>
                        <p className="text-white font-medium">{selectedClient.preferredName || 'None'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Emergency Contact</p>
                      <p className="text-white font-medium">{selectedClient.emergencyContactName || 'N/A'}</p>
                      <p className="text-xs text-slate-400">{selectedClient.emergencyContactPhone}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">What prompted seeking support?</p>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedClient.prompt || 'None shared'}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Current Challenges</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(selectedClient.challenges || []).map((c: string) => (
                          <span key={c} className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded-md border border-emerald-500/20">
                            {c}
                          </span>
                        ))}
                        {selectedClient.otherChallenge && (
                          <span className="px-2 py-1 bg-slate-500/10 text-slate-400 text-[10px] font-bold uppercase rounded-md border border-slate-500/20">
                            Other: {selectedClient.otherChallenge}
                          </span>
                        )}
                        {(!selectedClient.challenges?.length && !selectedClient.otherChallenge) && (
                          <p className="text-white text-sm">None shared</p>
                        )}
                      </div>
                      {selectedClient.duration && (
                        <p className="text-xs text-slate-500 mt-2 italic">Duration: {selectedClient.duration}</p>
                      )}
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Formal Diagnosis</p>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedClient.formalDiagnosis || 'None shared'}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Currently Seeing Therapist?</p>
                      <p className="text-white text-sm">{selectedClient.seeingTherapist || 'None shared'}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Strengths</p>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedClient.strengths || 'None shared'}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Preferred Frequency</p>
                      <p className="text-white text-sm">{selectedClient.frequency || 'None shared'}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Scheduling Constraints</p>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedClient.schedulingConstraints || 'None shared'}</p>
                    </div>

                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Anything Else?</p>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedClient.anythingElse || 'None shared'}</p>
                    </div>
                  </div>

                  {selectedClient.parentName && (
                    <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Parent/Guardian Information</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Primary</p>
                          <p className="text-white font-medium">{selectedClient.parentName}</p>
                          <p className="text-xs text-slate-400">{selectedClient.parentPhone}</p>
                          <p className="text-xs text-slate-400">{selectedClient.parentEmail}</p>
                        </div>
                        {selectedClient.secondaryParentName && (
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Secondary</p>
                            <p className="text-white font-medium">{selectedClient.secondaryParentName}</p>
                            <p className="text-xs text-slate-400">{selectedClient.secondaryParentPhone}</p>
                            <p className="text-xs text-slate-400">{selectedClient.secondaryParentEmail}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-6 mb-8">
                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Upcoming Appointments</h4>
                  <div className="space-y-3">
                    {appointments
                      .filter((a: any) => a.clientEmail === selectedClient.email && isAfter(safeToDate(a.startTime), new Date()))
                      .sort((a: any, b: any) => safeToDate(a.startTime).getTime() - safeToDate(b.startTime).getTime())
                      .map((appt: any) => (
                        <div key={appt.id} className="bg-slate-800/20 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{appt.title}</p>
                              <p className="text-xs text-slate-500">{format(safeToDate(appt.startTime), 'MMM d, yyyy • h:mm a')}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant={appt.status === 'scheduled' ? 'success' : 'default'}>{appt.status}</Badge>
                            <a 
                              href={getGoogleCalendarLink(appt)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase flex items-center gap-1"
                            >
                              <Calendar className="w-3 h-3" /> Add
                            </a>
                          </div>
                        </div>
                      ))}
                    {appointments.filter((a: any) => a.clientEmail === selectedClient.email && isAfter(safeToDate(a.startTime), new Date())).length === 0 && (
                      <div className="text-center py-6 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-slate-500 text-sm">No upcoming appointments.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Recent Sessions</h4>
                  <div className="space-y-3">
                    {appointments
                      .filter((a: any) => a.clientEmail === selectedClient.email && isBefore(safeToDate(a.startTime), new Date()))
                      .sort((a: any, b: any) => safeToDate(b.startTime).getTime() - safeToDate(a.startTime).getTime())
                      .slice(0, 5)
                      .map((appt: any) => (
                        <div key={appt.id} className="bg-slate-800/20 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-500">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{appt.title}</p>
                              <p className="text-xs text-slate-500">{format(safeToDate(appt.startTime), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <Badge variant="default">Completed</Badge>
                        </div>
                      ))}
                    {appointments.filter((a: any) => a.clientEmail === selectedClient.email && isBefore(safeToDate(a.startTime), new Date())).length === 0 && (
                      <div className="text-center py-6 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-slate-500 text-sm">No past sessions found.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Shared Documents</h4>
                  <div className="space-y-3">
                    {documents
                      .filter((d: any) => d.sharedWithEmail === selectedClient.email)
                      .map((doc: any) => (
                        <div key={doc.id} className="bg-slate-800/20 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{doc.name}</p>
                              <p className="text-xs text-slate-500">{format(safeToDate(doc.createdAt), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <a 
                            href={doc.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    {documents.filter((d: any) => d.sharedWithEmail === selectedClient.email).length === 0 && (
                      <div className="text-center py-6 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-slate-500 text-sm">No shared documents.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {role === 'coach' && (
                <div className="space-y-8 mb-8">
                  <CoachNotesSection clientUid={selectedClient.uid} />
                  <div className="border-t border-slate-800 pt-8">
                    <PrivateNotesSection 
                      clientUid={selectedClient.uid} 
                      clientEmail={selectedClient.email}
                      appointments={appointments}
                    />
                  </div>
                </div>
              )}

              <button 
                onClick={() => setSelectedClient(null)}
                className="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
              >
                Close Profile
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isInviting && setShowInviteModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-bold text-white mb-2">Add New Client</h3>
              <p className="text-slate-400 mb-6">Create a client account and send login credentials.</p>
              
              {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm whitespace-pre-wrap">
                  {error}
                </div>
              )}

              <form onSubmit={handleInvite} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Full Name *</label>
                    <input 
                      type="text" 
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Email Address *</label>
                    <input 
                      type="email" 
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Phone Number (Optional)</label>
                    <input 
                      type="tel" 
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      placeholder="864-209-1043"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Password (Optional)</label>
                    <input 
                      type="text" 
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="Leave blank to auto-generate"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowOnboardingFields(!showOnboardingFields)}
                    className="flex items-center gap-2 text-emerald-500 font-bold text-sm hover:text-emerald-400 transition-colors"
                  >
                    {showOnboardingFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showOnboardingFields ? 'Hide Onboarding Fields' : 'Pre-fill Onboarding Data (Optional)'}
                  </button>

                  {showOnboardingFields && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 mt-6"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Age</label>
                          <input 
                            type="number" 
                            value={inviteAge}
                            onChange={(e) => setInviteAge(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Preferred Name</label>
                          <input 
                            type="text" 
                            value={invitePreferredName}
                            onChange={(e) => setInvitePreferredName(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Emergency Contact Name</label>
                          <input 
                            type="text" 
                            value={inviteEmergencyContactName}
                            onChange={(e) => setInviteEmergencyContactName(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Emergency Contact Phone</label>
                          <input 
                            type="tel" 
                            value={inviteEmergencyContactPhone}
                            onChange={(e) => setInviteEmergencyContactPhone(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">What prompted you to seek support right now?</label>
                        <textarea 
                          value={invitePrompt}
                          onChange={(e) => setInvitePrompt(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Current Challenges</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {[
                            "Homework initiation",
                            "Organization / losing materials",
                            "Time management",
                            "Emotional shutdown",
                            "School/Work Avoidance",
                            "Transitions",
                            "Follow-through"
                          ].map(option => (
                            <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                              <input 
                                type="checkbox"
                                checked={inviteChallenges.includes(option)}
                                onChange={() => {
                                  setInviteChallenges(prev => 
                                    prev.includes(option) ? prev.filter(c => c !== option) : [...prev, option]
                                  );
                                }}
                                className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                              />
                              <span className="text-sm text-slate-300">{option}</span>
                            </label>
                          ))}
                        </div>
                        <input 
                          type="text" 
                          placeholder="Other..."
                          value={inviteOtherChallenge}
                          onChange={e => setInviteOtherChallenge(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 mt-2"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">How long have these challenges been present?</label>
                        <input 
                          type="text" 
                          value={inviteDuration}
                          onChange={(e) => setInviteDuration(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Formal Diagnosis</label>
                        <textarea 
                          value={inviteFormalDiagnosis}
                          onChange={(e) => setInviteFormalDiagnosis(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Are you currently seeing a therapist or counselor?</label>
                        <div className="space-y-2">
                          {["Yes", "No", "Looking for one or looking for a new one"].map(option => (
                            <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                              <input 
                                type="radio"
                                name="inviteTherapist"
                                checked={inviteSeeingTherapist === option}
                                onChange={() => setInviteSeeingTherapist(option)}
                                className="w-4 h-4 border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                              />
                              <span className="text-sm text-slate-300">{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Important info about strengths</label>
                        <textarea 
                          value={inviteStrengths}
                          onChange={(e) => setInviteStrengths(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Preferred session frequency</label>
                        <div className="grid grid-cols-2 gap-2">
                          {["Weekly", "Biweekly", "Monthly", "As needed basis"].map(option => (
                            <label key={option} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                              <input 
                                type="radio"
                                name="inviteFrequency"
                                checked={inviteFrequency === option}
                                onChange={() => setInviteFrequency(option)}
                                className="w-4 h-4 border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                              />
                              <span className="text-sm text-slate-300">{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Scheduling Constraints</label>
                        <textarea 
                          value={inviteSchedulingConstraints}
                          onChange={(e) => setInviteSchedulingConstraints(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Anything else?</label>
                        <textarea 
                          value={inviteAnythingElse}
                          onChange={(e) => setInviteAnythingElse(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                        />
                      </div>

                      <div className="pt-4 border-t border-slate-800">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Parent/Guardian Info (For Minors)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Parent Name</label>
                            <input 
                              type="text" 
                              value={inviteParentName}
                              onChange={(e) => setInviteParentName(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Parent Phone</label>
                            <input 
                              type="tel" 
                              value={inviteParentPhone}
                              onChange={(e) => setInviteParentPhone(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Parent Email</label>
                          <input 
                            type="email" 
                            value={inviteParentEmail}
                            onChange={(e) => setInviteParentEmail(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="pt-4 mt-4 border-t border-slate-800/50">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Secondary Parent/Guardian (Optional)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Name</label>
                              <input 
                                type="text" 
                                value={inviteSecondaryParentName}
                                onChange={(e) => setInviteSecondaryParentName(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Phone</label>
                              <input 
                                type="tel" 
                                value={inviteSecondaryParentPhone}
                                onChange={(e) => setInviteSecondaryParentPhone(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                          </div>
                          <div className="mt-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Email</label>
                            <input 
                              type="email" 
                              value={inviteSecondaryParentEmail}
                              onChange={(e) => setInviteSecondaryParentEmail(e.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    disabled={isInviting}
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isInviting}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isInviting ? <Clock className="w-4 h-4 animate-spin" /> : null}
                    {isInviting ? 'Creating...' : 'Create Client'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Tools Library ---

const TOOLS = [
  
  {
    name: "Energy Balance Dashboard",
    description: "The Energy Balance Dashboard is a low-friction tool designed to help you visualize your daily capacity and prevent burnout using the principles of Energy Accounting. Simply log your morning readiness using the quick slider, then tap to rate your daily activities as either energy 'drains' or restorative 'deposits'. The dashboard automatically graphs your trends so you can easily see what depletes your battery, proactively plan your recovery time, and export a one-click summary for our coaching sessions.",
    link: "https://script.google.com/macros/s/AKfycbweI30Ufi6n9vAPRsJGf_9duWFbIQ396LWvQUhuPP1q30oWbkp8EMaBgUFquFJG8yfIqA/exec"
  },
  {
    name: "Task Deconstructor",
    description: "The Task Deconstructor is a low-friction tool designed to help you bypass executive dysfunction and overcome the paralysis of getting started. Simply type in an overwhelming task and click 'Deconstruct For Me' to let the app automatically break your goal into microscopic, highly specific actions. Once you begin, the tool activates Tunnel Vision by hiding the overarching list and displaying only one single step on the screen at a time. Just focus on the action in front of you, click the 'Done' button when finished, and seamlessly build momentum until the entire project is cleared.",
    link: "https://script.google.com/macros/s/AKfycbxxSdjN86vzQHKZKL2E8hbP8q7EpoV_2Fw1ATDW-qjIjhnBOw9HANpjEz-T5A0nRQUnZA/exec"
  },
  {
    name: "Time-Blindness Visualizer",
    description: `The Time-Blindness Visualizer is a sensory-friendly pacing tool designed to replace anxiety-inducing numerical countdowns with a low-demand visual representation of time. Simply select or type in your desired duration, and the screen will display five green energy blocks that gently drain in halves as time passes, allowing you to gauge your remaining "time volume" at a quick glance without doing mental math. When your session is complete, a soft, harmonic singing bowl chime provides a gentle cue to transition, allowing you to easily reset for your next focused chunk of work. This tool is built specifically to protect your working memory and help you pace your energy without triggering demand avoidance.`,
    link: "https://script.google.com/macros/s/AKfycbxVvlVK0cWsvZYnQagg64by2xYbT_H3jwrZRS-v9QAzThwUzVGMmWQx8_qDJtQzVyzN/exec"
  },
  {
    name: "Frictionless Brain Dump",
    description: `The Frictionless Brain Dump is designed to help you instantly externalize your working memory without the executive function tax of organizing your thoughts on the spot. Whether you have a sudden idea, a looming task, or simply need to process an emotion, just type or dictate your raw thoughts into the single text box and hit save. Every evening at 5:00 PM, the system automatically reviews your raw notes, sorts them into Tasks, Ideas, and Emotional Check-ins, and delivers a clean, organized digest straight to your inbox.`,
    link: "https://script.google.com/macros/s/AKfycbzl0-CRbGpB5PCWTqzPMSdvK-QCWCBNiT72x_UF7CmQaWcybFZ0Bw1lc6zyci1kDR75/exec"
  }
];

function ToolsLibraryView() {
  const [expandedIndices, setExpandedIndices] = useState<number[]>([]);

  const toggleExpand = (index: number) => {
    setExpandedIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const getTruncatedText = (text: string, index: number) => {
    const words = text.split(' ');
    const isExpanded = expandedIndices.includes(index);
    
    if (words.length <= 30 || isExpanded) {
      return (
        <>
          {text}
          {words.length > 30 && (
            <button 
              onClick={() => toggleExpand(index)}
              className="ml-1 text-emerald-500 hover:text-emerald-400 font-medium focus:outline-none"
            >
              less
            </button>
          )}
        </>
      );
    }

    return (
      <>
        {words.slice(0, 30).join(' ')}...
        <button 
          onClick={() => toggleExpand(index)}
          className="ml-1 text-emerald-500 hover:text-emerald-400 font-medium focus:outline-none"
        >
          more
        </button>
      </>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">Tools Library</h2>
        <p className="text-slate-400 mt-1">Access useful Apps Script applications and tools.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TOOLS.map((tool, index) => (
          <div key={index} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl group hover:border-emerald-500/50 transition-all flex flex-col">
            <div className="w-12 h-12 bg-emerald-600/10 rounded-xl flex items-center justify-center text-emerald-500 mb-4">
              <Wrench className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{tool.name}</h3>
            <div className="text-sm text-slate-400 mb-6 flex-1 leading-relaxed">
              {getTruncatedText(tool.description, index)}
            </div>
            <a 
              href={tool.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-emerald-600 transition-all group-hover:shadow-lg group-hover:shadow-emerald-600/10"
            >
              Open Tool <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryView({ clients, user }: { clients: UserProfile[], user: User }) {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharingFile, setSharingFile] = useState<any>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [isSharing, setIsSharing] = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);

  useEffect(() => {
    checkDriveStatus();
  }, []);

  const checkDriveStatus = async () => {
    try {
      const res = await fetch('/api/drive/status');
      const data = await res.json();
      setDriveConnected(data.connected);
      if (data.connected) {
        fetchLibrary();
      } else {
        setLoading(false);
      }
    } catch (err) {
      setDriveConnected(false);
      setLoading(false);
    }
  };

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drive/library');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch library');
      }
      const data = await res.json();
      setFiles(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
      
      // Poll for connection status
      const interval = setInterval(async () => {
        const statusRes = await fetch('/api/drive/status');
        const statusData = await statusRes.json();
        if (statusData.connected) {
          clearInterval(interval);
          setDriveConnected(true);
          fetchLibrary();
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to get auth URL', err);
    }
  };

  const handleShare = async () => {
    if (!selectedClient || !sharingFile) return;
    setIsSharing(true);
    const client = clients.find(c => c.uid === selectedClient);
    try {
      const res = await fetch('/api/drive/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: sharingFile.id,
          fileName: sharingFile.name,
          clientUid: client?.uid,
          clientName: client?.displayName,
          clientEmail: client?.email,
          coachUid: user?.uid
        })
      });
      if (!res.ok) throw new Error('Failed to share file');
      setSharingFile(null);
      setSelectedClient('');
      alert('File shared successfully!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSharing(false);
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      const res = await fetch('/api/drive/disconnect', { method: 'POST' });
      if (res.ok) {
        setDriveConnected(false);
        setFiles([]);
      }
    } catch (err) {
      console.error('Failed to disconnect Drive', err);
    }
  };

  if (driveConnected === false) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center text-slate-500 mb-6">
          <Library className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Google Drive</h2>
        <p className="text-slate-400 max-w-md mb-8">
          Connect your Google account to browse your resource library and share documents directly with clients.
        </p>
        <button 
          onClick={handleConnectDrive}
          className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-500 transition-all flex items-center gap-2"
        >
          <ExternalLink className="w-5 h-5" /> Connect Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Resource Library</h2>
          <p className="text-slate-400 mt-1">Browse and share documents from your Google Drive library.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={fetchLibrary}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Refresh Library"
          >
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          <button 
            onClick={handleDisconnectDrive}
            className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
            title="Disconnect Google Drive"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-center">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {files.map((file: any) => (
            <div key={file.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl group hover:border-emerald-500/50 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center">
                  <img src={file.iconLink} alt="" className="w-6 h-6" referrerPolicy="no-referrer" />
                </div>
                <div className="flex gap-2">
                  <a 
                    href={file.webViewLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 text-slate-500 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
              <h4 className="text-white font-bold mb-6 line-clamp-2 h-12">{file.name}</h4>
              <button 
                onClick={() => setSharingFile(file)}
                className="w-full py-3 bg-emerald-600/10 text-emerald-500 rounded-xl font-bold hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Share with Client
              </button>
            </div>
          ))}
          {files.length === 0 && (
            <div className="col-span-full text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
              <Library className="w-16 h-16 text-slate-800 mx-auto mb-4" />
              <p className="text-slate-600">No files found in your library folder.</p>
              <p className="text-slate-700 text-sm mt-2">Make sure you've set the correct GOOGLE_DRIVE_LIBRARY_FOLDER_ID.</p>
            </div>
          )}
        </div>
      )}

      {/* Share Modal */}
      <AnimatePresence>
        {sharingFile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSharing && setSharingFile(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-2">Share Resource</h3>
              <p className="text-slate-400 mb-6">Select a client to share <span className="text-white font-bold">"{sharingFile.name}"</span> with.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Select Client</label>
                  <select 
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Choose a client...</option>
                    {clients.map(c => (
                      <option key={c.uid} value={c.uid}>{c.displayName}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    disabled={isSharing}
                    onClick={() => setSharingFile(null)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isSharing || !selectedClient}
                    onClick={handleShare}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSharing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    {isSharing ? "Sharing..." : "Share Copy"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DocumentsView({ documents, role, user }: any) {
  const [uploading, setUploading] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `documents/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        name: file.name,
        url,
        ownerUid: user.uid,
        sharedWithEmail: selectedClient,
        createdAt: serverTimestamp()
      });
      alert('Document uploaded and shared!');
    } catch (error) {
      console.error(error);
      alert('Upload failed');
    } finally {
      setUploading(false);
      setSelectedClient('');
    }
  };

  const handleDelete = async (docId: string, url: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await deleteDoc(doc(db, 'documents', docId));
      // Optionally delete from storage too
      // const storageRef = ref(storage, url);
      // await deleteObject(storageRef);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Document Library</h2>
          <p className="text-slate-400 mt-1">Share and manage coaching materials securely.</p>
        </div>
      </header>

      {role === 'coach' && (
        <Card title="Upload New Document" subtitle="Share a file with a specific client">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-slate-400 mb-2">Select Client Email</label>
              <input 
                type="email" 
                placeholder="client@example.com"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="w-full md:w-auto">
              <label className={cn(
                "flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all cursor-pointer",
                !selectedClient ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-500"
              )}>
                {uploading ? <Clock className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Choose File'}
                <input 
                  type="file" 
                  className="hidden" 
                  disabled={!selectedClient || uploading}
                  onChange={handleUpload}
                />
              </label>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documents.map((doc: any) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex gap-2">
                <a 
                  href={doc.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                </a>
                {role === 'coach' && (
                  <button 
                    onClick={() => handleDelete(doc.id, doc.url)}
                    className="p-2 bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <h4 className="text-lg font-bold text-white truncate mb-1">{doc.name}</h4>
            <p className="text-xs text-slate-500 mb-4">Shared with: {doc.sharedWithEmail}</p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-[10px] text-slate-600 uppercase font-bold tracking-widest">
                {format(safeToDate(doc.createdAt), 'MMM d, yyyy')}
              </span>
              <Badge variant="default">PDF / Doc</Badge>
            </div>
          </motion.div>
        ))}
        {documents.length === 0 && (
          <div className="col-span-full text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <FileText className="w-16 h-16 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-600">No documents shared yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RemindersView({ appointments, role, notificationPermission, onRequestNotifications }: any) {
  const upcomingReminders = useMemo(() => {
    return appointments
      .filter((a: any) => a.status === 'scheduled' && isAfter(safeToDate(a.startTime), new Date()))
      .slice(0, 10);
  }, [appointments]);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">Automated Reminders</h2>
        <p className="text-slate-400 mt-1">Track and manage automated email notifications for your sessions.</p>
      </header>

      {notificationPermission !== 'granted' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 border",
            notificationPermission === 'denied' 
              ? "bg-rose-500/5 border-rose-500/20" 
              : "bg-emerald-600/10 border-emerald-500/20"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              notificationPermission === 'denied' ? "bg-rose-500/20 text-rose-500" : "bg-emerald-500/20 text-emerald-500"
            )}>
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">
                {notificationPermission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
              </h4>
              <p className="text-slate-400 text-sm">
                {notificationPermission === 'denied' 
                  ? 'Your browser is blocking notifications. Please enable them in your browser settings to receive alerts.' 
                  : 'Stay updated with real-time alerts for sessions, documents, and messages.'}
              </p>
            </div>
          </div>
          {notificationPermission === 'default' ? (
            <button 
              onClick={onRequestNotifications}
              className="whitespace-nowrap bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
            >
              Allow Notifications
            </button>
          ) : (
            <div className="text-xs text-rose-400 font-medium flex items-center gap-2 bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">
              <AlertCircle className="w-4 h-4" /> Action Required in Browser Settings
            </div>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Upcoming Reminders" subtitle="Next 10 scheduled notifications">
            <div className="space-y-4">
              {upcomingReminders.map((appt: any) => (
                <div key={appt.id} className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-bold text-white">{appt.title}</h5>
                    <span className="text-xs text-slate-500">{format(safeToDate(appt.startTime), 'MMM d, h:mm a')}</span>
                  </div>
                  <div className="flex gap-3">
                    <div className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border",
                      appt.remindersSent?.includes('48h') 
                        ? "bg-emerald-900/20 text-emerald-400 border-emerald-800/50" 
                        : "bg-slate-900/50 text-slate-500 border-slate-800"
                    )}>
                      {appt.remindersSent?.includes('48h') ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      48h Reminder
                    </div>
                    <div className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border",
                      appt.remindersSent?.includes('1h') 
                        ? "bg-emerald-900/20 text-emerald-400 border-emerald-800/50" 
                        : "bg-slate-900/50 text-slate-500 border-slate-800"
                    )}>
                      {appt.remindersSent?.includes('1h') ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      1h Reminder
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Reminder Status" className="bg-emerald-600/5 border-emerald-600/20">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-emerald-500 font-bold uppercase tracking-wider">System Active</p>
                <p className="text-xs text-slate-400">Reminders are sent automatically.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">48h Window</span>
                <span className="text-white font-medium">Enabled</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">1h Window</span>
                <span className="text-white font-medium">Enabled</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Last Check</span>
                <span className="text-white font-medium">Just now</span>
              </div>
            </div>
          </Card>

          {role === 'coach' && (
            <div className="bg-amber-900/10 border border-amber-900/30 p-6 rounded-2xl">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h5 className="text-sm font-bold text-amber-500 mb-1">External Clients</h5>
                  <p className="text-xs text-amber-500/70 leading-relaxed">
                    Reminders are sent to all emails found in synced calendar events, even if they haven't registered for the portal yet.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ profile, role, notificationPermission, onRequestNotifications }: any) {
  const [emailTemplate, setEmailTemplate] = useState(profile?.reminderTemplate || 'Hi, your session "{title}" is in {time}.');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncSettings, setSyncSettings] = useState<any>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role === 'coach') {
      fetchSyncSettings();
    }
  }, [role]);

  const fetchSyncSettings = async () => {
    try {
      const res = await fetch('/api/admin/sync-settings');
      const data = await res.json();
      setSyncSettings(data);
    } catch (err) {
      console.error('Failed to fetch sync settings', err);
    }
  };

  const handleUpdateSyncSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncSettings)
      });
      if (res.ok) {
        alert('Sync settings updated!');
      } else {
        throw new Error('Failed to update');
      }
    } catch (err) {
      console.error('Failed to update sync settings', err);
      alert('Failed to update sync settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        reminderTemplate: emailTemplate
      });
      alert('Reminder template updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
      alert('Failed to update template.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${auth.currentUser.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        photoURL: url
      });
      await updateProfile(auth.currentUser, { photoURL: url });
      alert('Avatar updated successfully!');
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Failed to upload avatar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">Portal Settings</h2>
        <p className="text-slate-400 mt-1">Configure your profile and coaching preferences.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Profile Information" subtitle="Update your public profile details">
            <div className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-3xl font-bold overflow-hidden">
                  {profile?.photoURL ? (
                    <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    profile?.displayName[0]
                  )}
                </div>
                <div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleAvatarChange} 
                    className="hidden" 
                    accept="image/*"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Change Avatar'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">JPG, PNG or GIF. Max size 2MB.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Full Name</label>
                  <input 
                    type="text" 
                    disabled
                    value={profile?.displayName || ''}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-600 mt-2 italic">Contact your coach to change your registered name.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
                  <input 
                    type="email" 
                    disabled
                    defaultValue={profile?.email}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
              {/* Profile save button removed as fields are now read-only */}
            </div>
          </Card>

          {role === 'coach' && (
            <Card title="Reminder Templates" subtitle="Customize the emails sent to your clients">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Default Template</label>
                  <textarea 
                    rows={4}
                    value={emailTemplate}
                    onChange={(e) => setEmailTemplate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">Available variables: {'{title}'}, {'{time}'}, {'{date}'}</p>
                </div>
                <button 
                  onClick={handleUpdateTemplate}
                  disabled={saving}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Update Templates'}
                </button>
              </div>
            </Card>
          )}

          {role === 'coach' && syncSettings && (
            <Card title="Sync & Reminders" subtitle="Manage background tasks and costs">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Calendar Sync Hours (EST, 0-23)</label>
                    <input 
                      type="text" 
                      value={syncSettings.calendarSyncHours.join(', ')}
                      onChange={(e) => {
                        const hours = e.target.value.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
                        setSyncSettings({...syncSettings, calendarSyncHours: hours});
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. 6, 12"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Comma separated hours in 24h format.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-400 mb-2">Reminder Start (EST)</label>
                      <input 
                        type="number" 
                        min="0" max="23"
                        value={syncSettings.reminderStartHour}
                        onChange={(e) => setSyncSettings({...syncSettings, reminderStartHour: parseInt(e.target.value)})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-400 mb-2">Reminder End (EST)</label>
                      <input 
                        type="number" 
                        min="0" max="23"
                        value={syncSettings.reminderEndHour}
                        onChange={(e) => setSyncSettings({...syncSettings, reminderEndHour: parseInt(e.target.value)})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="catchAll"
                    checked={syncSettings.catchAllAfterEnd}
                    onChange={(e) => setSyncSettings({...syncSettings, catchAllAfterEnd: e.target.checked})}
                    className="w-5 h-5 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="catchAll" className="text-sm text-slate-300">
                    Send evening reminders at the last sync of the day ({syncSettings.reminderEndHour}:00 EST)
                  </label>
                </div>
                <button 
                  onClick={handleUpdateSyncSettings}
                  disabled={saving}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Sync Settings'}
                </button>
              </div>
            </Card>
          )}

          <Card title="Notifications" subtitle="Manage how you receive updates">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    notificationPermission === 'granted' ? "bg-emerald-500/10 text-emerald-500" : 
                    notificationPermission === 'denied' ? "bg-rose-500/10 text-rose-500" : "bg-slate-500/10 text-slate-500"
                  )}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div 
                    className={cn(
                      "cursor-pointer group",
                      notificationPermission === 'default' && "hover:opacity-80"
                    )}
                    onClick={() => {
                      if (notificationPermission === 'default') {
                        onRequestNotifications();
                      }
                    }}
                  >
                    <p className={cn(
                      "text-sm font-bold text-white",
                      notificationPermission === 'default' && "group-hover:text-emerald-400 underline decoration-emerald-500/30 underline-offset-4"
                    )}>
                      Web Notifications
                    </p>
                    <p className="text-xs text-slate-500">
                      {notificationPermission === 'granted' ? 'Enabled for this browser' : 
                       notificationPermission === 'denied' ? 'Blocked by browser settings' : 'Click to enable notifications'}
                    </p>
                  </div>
                </div>
                {notificationPermission === 'default' && (
                  <button 
                    onClick={onRequestNotifications}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-500 transition-all"
                  >
                    Enable
                  </button>
                )}
                {notificationPermission === 'denied' && (
                  <div 
                    className="text-xs text-rose-400 font-medium flex items-center gap-1 cursor-help hover:text-rose-300 transition-colors"
                    title="To enable notifications, click the lock icon in your browser address bar and change 'Notifications' to 'Allow'."
                  >
                    <AlertCircle className="w-4 h-4" /> Please enable in browser settings
                  </div>
                )}
                {notificationPermission === 'granted' && (
                  <div className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Active
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700">
                <p className="text-xs text-slate-500 leading-relaxed">
                  When enabled, you will receive real-time notifications for:
                </p>
                <ul className="mt-2 space-y-1">
                  <li className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" /> Appointment Reminders
                  </li>
                  <li className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" /> Shared Documents
                  </li>
                  <li className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" /> Message Notifications
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Account Security">
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <p className="text-sm font-bold text-white mb-1">Role</p>
                <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
              </div>
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <p className="text-sm font-bold text-white mb-1">Two-Factor Auth</p>
                <p className="text-xs text-slate-500">Not enabled</p>
              </div>
              <button className="w-full py-3 text-rose-400 hover:bg-rose-400/5 rounded-xl border border-rose-400/20 transition-all text-sm font-medium">
                Delete Account
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
