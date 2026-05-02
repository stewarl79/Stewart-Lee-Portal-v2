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
  User as UserIcon,
  UserPlus,
  RefreshCw,
  Share2,
  Library,
  Mic2,
  MessageCircle,
  MessageSquare,
  FolderOpen,
  ShieldCheck,
  FileCheck,
  Save,
  Activity,
  ClipboardCheck,
  ArrowRight,
  ArrowLeft,
  Wrench,
  Zap,
  Layers,
  Hourglass,
  Brain,
  BrainCircuit
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
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

import { ABCWorksheet } from './components/tools/ABCWorksheet';
import { BrainDump } from './components/tools/BrainDump';
import EnergyBalanceDashboard from './components/EnergyBalanceDashboard';
import DearManMastery from './components/DearManMastery';

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
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

interface ReflectionTemplate {
  id: string;
  coachUid: string;
  clientUid?: string;
  questions: string[];
  isEnabled: boolean;
  updatedAt: any;
}

interface Reflection {
  id: string;
  clientUid: string;
  appointmentId: string;
  sessionDate: string;
  responses: Record<string, string>;
  status: 'draft' | 'submitted';
  createdAt: any;
  updatedAt: any;
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

interface Goal {
  id: string;
  clientUid: string;
  title: string;
  description?: string;
  targetDate?: string;
  status: 'active' | 'completed' | 'archived';
  progress: number;
  createdAt: any;
}

interface Habit {
  id: string;
  clientUid: string;
  name: string;
  frequency?: string;
  reportingType: 'binary' | 'count' | 'minutes' | 'miles' | 'percent' | 'servings';
  targetValue?: number;
  streak: number;
  lastCompleted?: string;
  history?: Record<string, any>;
  createdAt: any;
}

interface SubjectiveMetric {
  id: string;
  clientUid: string;
  name: string;
  scaleMax: 5 | 7 | 10;
  lowAnchor: string;
  highAnchor: string;
  lastCompleted?: string;
  history?: Record<string, number>;
  createdAt: any;
}

interface LibraryGoal {
  id: string;
  text: string;
  coachUid: string;
  usageCount?: number;
}

interface LibraryObjective {
  id: string;
  text: string;
  goalText: string;
  coachUid: string;
  usageCount?: number;
}

interface TreatmentPlan {
  id: string;
  clientUid: string;
  coachUid: string;
  goalTitle: string;
  objectives: {
    text: string;
    status: 'In Progress' | 'Steady Momentum' | 'Achieved' | 'Paused';
    createdAt: any;
  }[];
  status: 'active' | 'completed' | 'archived';
  createdAt: any;
  updatedAt?: any;
}

interface ABCReframing {
  id: string;
  clientUid: string;
  coachUid: string;
  situation: string;
  thoughts: string;
  consequences: string;
  realisticReflection: string;
  futureReflection: string;
  createdAt: any;
  updatedAt?: any;
}

interface LibraryGoal {
  id: string;
  text: string;
  coachUid: string;
  usageCount?: number;
}

interface LibraryObjective {
  id: string;
  text: string;
  goalText: string;
  coachUid: string;
  usageCount?: number;
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
    aria-current={active ? 'page' : undefined}
    className={cn(
      "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-focus",
      active 
        ? "bg-brand-accent text-white shadow-lg shadow-brand-accent/20" 
        : "text-slate-400 hover:bg-brand-surface hover:text-white"
    )}
  >
    <div className="flex items-center gap-3">
      <Icon className={cn("w-5 h-5", active ? "text-white" : "group-hover:text-brand-accent")} />
      <span className="font-medium">{label}</span>
    </div>
    {badge !== undefined && badge > 0 && (
      <span className={cn(
        "px-2 py-0.5 text-[10px] font-bold rounded-full",
        active ? "bg-white text-brand-accent" : "bg-brand-accent text-white"
      )}>
        {badge}
      </span>
    )}
  </button>
);

const Card = ({ children, title, subtitle, action, className }: any) => (
  <div className={cn("bg-brand-surface border border-slate-800/50 rounded-2xl p-6 overflow-hidden shadow-xl", className)}>
    <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
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
    success: "bg-brand-accent/10 text-brand-accent border border-brand-accent/20",
    warning: "bg-amber-900/30 text-amber-400 border border-amber-800/50",
    error: "bg-rose-900/30 text-rose-400 border border-rose-800/50"
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant])}>
      {children}
    </span>
  );
};

// --- Coaching Dashboard Component ---

function TreatmentPlanModule({ client, user }: { client: any; user: any }) {
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [libraryGoals, setLibraryGoals] = useState<LibraryGoal[]>([]);
  const [libraryObjectives, setLibraryObjectives] = useState<LibraryObjective[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | null>(null);
  const [newPlanGoal, setNewPlanGoal] = useState('');
  const [newPlanObjectives, setNewPlanObjectives] = useState<{ text: string; status: TreatmentPlan['objectives'][0]['status'] }[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isRefining, setIsRefining] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!client?.uid) return;
    const q = query(collection(db, 'treatment_plans'), where('clientUid', '==', client.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TreatmentPlan)));
    });
  }, [client.uid]);

  useEffect(() => {
    if (editingPlan) {
      setNewPlanGoal(editingPlan.goalTitle);
      setNewPlanObjectives(editingPlan.objectives.map(o => ({ text: o.text, status: o.status })));
      setIsCreating(true);
    } else {
      setNewPlanGoal('');
      setNewPlanObjectives([]);
    }
  }, [editingPlan]);

  useEffect(() => {
    const qGoals = query(collection(db, 'library_goals'));
    const qObjs = query(collection(db, 'library_objectives'));
    
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setLibraryGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryGoal)));
    });
    const unsubObjs = onSnapshot(qObjs, (snapshot) => {
      setLibraryObjectives(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryObjective)));
    });
    
    return () => {
      unsubGoals();
      unsubObjs();
    };
  }, []);

  useEffect(() => {
    const qGoals = query(collection(db, 'library_goals'));
    const qObjs = query(collection(db, 'library_objectives'));
    
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setLibraryGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryGoal)));
    });
    const unsubObjs = onSnapshot(qObjs, (snapshot) => {
      setLibraryObjectives(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryObjective)));
    });
    
    return () => {
      unsubGoals();
      unsubObjs();
    };
  }, []);

  const handleAddPlan = async () => {
    if (!newPlanGoal) return;
    
    // Persistence: Save goal to library if new
    const existingGoal = libraryGoals.find(g => g.text.toLowerCase() === newPlanGoal.toLowerCase());
    if (!existingGoal) {
      await addDoc(collection(db, 'library_goals'), {
        text: newPlanGoal,
        coachUid: user.uid,
        usageCount: 1
      });
    } else {
      await updateDoc(doc(db, 'library_goals', existingGoal.id), {
        usageCount: (existingGoal.usageCount || 0) + 1
      });
    }

    // Persistence: Save objectives to library if new
    for (const obj of newPlanObjectives) {
      const existingObj = libraryObjectives.find(lo => lo.text.toLowerCase() === obj.text.toLowerCase() && lo.goalText.toLowerCase() === newPlanGoal.toLowerCase());
      if (!existingObj) {
        await addDoc(collection(db, 'library_objectives'), {
          text: obj.text,
          goalText: newPlanGoal,
          coachUid: user.uid,
          usageCount: 1
        });
      } else {
        await updateDoc(doc(db, 'library_objectives', existingObj.id), {
          usageCount: (existingObj.usageCount || 0) + 1
        });
      }
    }

    const planData = {
      clientUid: client.uid,
      coachUid: user.uid,
      goalTitle: newPlanGoal,
      objectives: newPlanObjectives.map(o => ({ ...o, createdAt: Timestamp.now() })),
      status: editingPlan ? editingPlan.status : 'active',
      updatedAt: serverTimestamp()
    };

    if (editingPlan) {
      await updateDoc(doc(db, 'treatment_plans', editingPlan.id), planData);
    } else {
      await addDoc(collection(db, 'treatment_plans'), {
        ...planData,
        createdAt: serverTimestamp()
      });
    }

    setIsCreating(false);
    setEditingPlan(null);
    setNewPlanGoal('');
    setNewPlanObjectives([]);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm('Are you sure you want to delete this treatment plan?')) return;
    setIsDeleting(planId);
    try {
      await deleteDoc(doc(db, 'treatment_plans', planId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `treatment_plans/${planId}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const updateObjectiveStatus = async (plan: TreatmentPlan, objIndex: number, newStatus: TreatmentPlan['objectives'][0]['status']) => {
    const updatedObjectives = [...plan.objectives];
    updatedObjectives[objIndex] = { ...updatedObjectives[objIndex], status: newStatus };
    
    try {
      await updateDoc(doc(db, 'treatment_plans', plan.id), {
        objectives: updatedObjectives,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `treatment_plans/${plan.id}`);
    }
  };

  const updatePlanStatus = async (planId: string, newStatus: TreatmentPlan['status']) => {
    try {
      await updateDoc(doc(db, 'treatment_plans', planId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `treatment_plans/${planId}`);
    }
  };

  const suggestObjectives = async () => {
    if (!newPlanGoal) return;
    setIsSuggesting(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Suggest 3-5 measurable, "Wiley-style" objectives for the following coaching goal: "${newPlanGoal}". 
        The objectives should be neurodiversity-affirming and strength-based. 
        Return them as a JSON array of strings.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      const suggestions = JSON.parse(response.text);
      setNewPlanObjectives([...newPlanObjectives, ...suggestions.map((s: string) => ({ text: s, status: 'In Progress' }))]);
    } catch (error) {
      console.error("AI Suggestion failed", error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const refineObjective = async (index: number) => {
    const obj = newPlanObjectives[index];
    if (!obj.text) return;
    setIsRefining(index);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Make the following coaching objective more measurable, neurodiversity-affirming, and strength-based: "${obj.text}". 
        Return only the refined objective text.`,
      });
      const refined = response.text.trim();
      const updated = [...newPlanObjectives];
      updated[index].text = refined;
      setNewPlanObjectives(updated);
    } catch (error) {
      console.error("AI Refinement failed", error);
    } finally {
      setIsRefining(null);
    }
  };

  const filteredLibraryGoals = libraryGoals.filter(g => g.text.toLowerCase().includes(newPlanGoal.toLowerCase()) && newPlanGoal.length > 2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-emerald-500" /> Treatment Plans
        </h3>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {plans.map(plan => (
          <Card 
            key={plan.id} 
            title={plan.goalTitle} 
            subtitle={`Created ${format(safeToDate(plan.createdAt), 'MMM d, yyyy')}`}
            action={
              <div className="flex items-center gap-2">
                <select 
                  value={plan.status}
                  onChange={(e) => updatePlanStatus(plan.id, e.target.value as TreatmentPlan['status'])}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
                <button 
                  onClick={() => setEditingPlan(plan)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Edit Plan"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeletePlan(plan.id)}
                  disabled={isDeleting === plan.id}
                  className="p-2 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
                  title="Delete Plan"
                >
                  {isDeleting === plan.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {plan.objectives.map((obj, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                  <p className="text-slate-200 text-sm flex-1 mr-4">{obj.text}</p>
                  <select 
                    value={obj.status}
                    onChange={(e) => updateObjectiveStatus(plan, idx, e.target.value as any)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all focus:outline-none",
                      obj.status === 'Achieved' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                      obj.status === 'Steady Momentum' ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                      obj.status === 'Paused' ? "bg-slate-700 text-slate-400 border border-slate-600" :
                      "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    )}
                  >
                    <option value="In Progress">In Progress</option>
                    <option value="Steady Momentum">Steady Momentum</option>
                    <option value="Achieved">Achieved</option>
                    <option value="Paused">Paused</option>
                  </select>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {plans.length === 0 && (
          <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <ClipboardCheck className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500">No treatment plans created for this client yet.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-bold text-white mb-6">{editingPlan ? 'Edit' : 'Create'} Treatment Plan</h3>
              
              <div className="space-y-6">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Goal / Focus Area</label>
                  <input 
                    type="text"
                    value={newPlanGoal}
                    onChange={(e) => setNewPlanGoal(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g., Emotional Regulation"
                  />
                  {filteredLibraryGoals.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                      {filteredLibraryGoals.map(g => (
                        <button
                          key={g.id}
                          onClick={() => {
                            setNewPlanGoal(g.text);
                            const relatedObjs = libraryObjectives.filter(o => o.goalText === g.text);
                            setNewPlanObjectives(relatedObjs.map(o => ({ text: o.text, status: 'In Progress' })));
                          }}
                          className="w-full px-4 py-3 text-left text-slate-300 hover:bg-slate-700 hover:text-white transition-colors border-b border-slate-700 last:border-0"
                        >
                          {g.text} <span className="text-[10px] text-emerald-500 ml-2 font-bold uppercase">Library Match</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Measurable Objectives</label>
                    <button 
                      onClick={suggestObjectives}
                      disabled={!newPlanGoal || isSuggesting}
                      className="text-xs font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isSuggesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Suggest with AI
                    </button>
                  </div>
                  
                  {newPlanObjectives.map((obj, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="flex-1 relative">
                        <textarea 
                          value={obj.text}
                          onChange={(e) => {
                            const updated = [...newPlanObjectives];
                            updated[idx].text = e.target.value;
                            setNewPlanObjectives(updated);
                          }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                        />
                        <button 
                          onClick={() => refineObjective(idx)}
                          disabled={isRefining === idx}
                          className="absolute bottom-3 right-3 p-1.5 bg-slate-700 text-slate-400 hover:text-emerald-500 rounded-lg transition-colors"
                          title="Make this measurable with AI"
                        >
                          {isRefining === idx ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        </button>
                      </div>
                      <button 
                        onClick={() => setNewPlanObjectives(newPlanObjectives.filter((_, i) => i !== idx))}
                        className="p-3 text-slate-600 hover:text-rose-500"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}

                  <button 
                    onClick={() => setNewPlanObjectives([...newPlanObjectives, { text: '', status: 'In Progress' }])}
                    className="w-full py-3 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                  >
                    <Plus className="w-4 h-4" /> Add Objective
                  </button>
                </div>

                <div className="flex gap-3 pt-6">
                  <button 
                    onClick={() => {
                      setIsCreating(false);
                      setEditingPlan(null);
                    }}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAddPlan}
                    disabled={!newPlanGoal || newPlanObjectives.length === 0}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {editingPlan ? 'Update' : 'Save'} Treatment Plan
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

function ABCReframingModal({ client, user, isOpen, onClose, entry, isToolsSite }: { client: any; user: any; isOpen: boolean; onClose: () => void; entry?: ABCReframing | null; isToolsSite?: boolean }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-4xl bg-brand-surface border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
          >
            <button 
              onClick={onClose} 
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            <ABCWorksheet 
              initialData={entry} 
              onSave={onClose}
              isPrivate={isToolsSite}
              clientUid={client?.uid}
              coachUid={user?.uid}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ABCReframingModule({ client, user }: { client: any; user: any }) {
  const [entries, setEntries] = useState<ABCReframing[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ABCReframing | null>(null);

  useEffect(() => {
    if (!client?.uid) return;
    const q = query(
      collection(db, 'abc_reframing'), 
      where('clientUid', '==', client.uid), 
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ABCReframing)));
    });
  }, [client.uid]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this reframing entry?')) return;
    try {
      await deleteDoc(doc(db, 'abc_reframing', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `abc_reframing/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-brand-accent" /> ABC Cognitive Reframing
        </h3>
        <button 
          onClick={() => {
            setEditingEntry(null);
            setIsCreating(true);
          }}
          className="px-4 py-2 bg-brand-accent text-white rounded-xl font-bold hover:bg-brand-secondary transition-all flex items-center gap-2 shadow-lg shadow-brand-accent/20"
        >
          <Plus className="w-4 h-4" /> New Reframing
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {entries.map(entry => (
          <div key={entry.id} className="bg-brand-surface border border-slate-800/50 rounded-3xl p-6 shadow-xl relative group">
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button 
                onClick={() => {
                  setEditingEntry(entry);
                  setIsCreating(true);
                }} 
                className="p-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-lg"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(entry.id)} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-800/50 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-black text-xs">A</div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Activating Event</p>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">{entry.situation}</p>
              </div>

              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-black text-xs">B</div>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Belief / Stuck Point</p>
                </div>
                <p className="text-sm text-slate-200 italic leading-relaxed">"{entry.thoughts}"</p>
              </div>

              <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-black text-xs">C</div>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Consequence</p>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">{entry.consequences}</p>
              </div>

              {(entry.realisticReflection || entry.futureReflection) && (
                <div className="p-5 bg-brand-accent/5 rounded-2xl border border-brand-accent/10 space-y-4">
                  {entry.realisticReflection && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Realistic or Helpful?</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{entry.realisticReflection}</p>
                    </div>
                  )}
                  {entry.futureReflection && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Future Self-Talk</p>
                      <p className="text-sm text-brand-accent font-medium leading-relaxed">{entry.futureReflection}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="col-span-full text-center py-12 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <Activity className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500">No cognitive reframing entries yet.</p>
          </div>
        )}
      </div>

      <ABCReframingModal 
        client={client} 
        user={user} 
        isOpen={isCreating} 
        onClose={() => setIsCreating(false)} 
        entry={editingEntry} 
      />
    </div>
  );
}

function ABCRoadmapView({ client }: { client: any }) {
  const [entries, setEntries] = useState<ABCReframing[]>([]);

  useEffect(() => {
    if (!client?.uid) return;
    const q = query(
      collection(db, 'abc_reframing'), 
      where('clientUid', '==', client.uid), 
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    return onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ABCReframing)));
    });
  }, [client.uid]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5 text-brand-accent" />
        <h4 className="font-bold text-white tracking-tight">ABC Cognitive Reframing</h4>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {entries.map(entry => (
          <div key={entry.id} className="bg-brand-surface border border-slate-800 p-5 rounded-3xl shadow-lg hover:border-brand-accent/50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recent Reframing</p>
              <p className="text-[10px] text-slate-600 italic">Added {format(safeToDate(entry.createdAt), 'MMM d')}</p>
            </div>
            <h5 className="text-white font-bold mb-3 line-clamp-1">{entry.situation}</h5>
            
            <div className="space-y-2">
              <div className="bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
                <p className="text-[9px] font-black text-amber-500/50 uppercase tracking-tighter mb-0.5">Thought (B)</p>
                <p className="text-xs text-slate-400 italic line-clamp-1">"{entry.thoughts}"</p>
              </div>

              <div className="bg-indigo-500/5 p-2 rounded-xl border border-indigo-500/10">
                <p className="text-[9px] font-black text-indigo-500/50 uppercase tracking-tighter mb-0.5">Consequence (C)</p>
                <p className="text-xs text-slate-400 line-clamp-1">{entry.consequences}</p>
              </div>

              {entry.futureReflection && (
                <div className="bg-brand-accent/5 p-3 rounded-xl border border-brand-accent/10 flex items-start gap-3">
                  <Zap className="w-4 h-4 text-brand-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] font-black text-brand-accent/50 uppercase tracking-tighter mb-0.5">Future Self-Talk</p>
                    <p className="text-sm text-brand-accent line-clamp-2">{entry.futureReflection}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreatmentLibraryView() {
  const [goals, setGoals] = useState<LibraryGoal[]>([]);
  const [objectives, setObjectives] = useState<LibraryObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const qGoals = query(collection(db, 'library_goals'), orderBy('usageCount', 'desc'));
    const qObjs = query(collection(db, 'library_objectives'), orderBy('usageCount', 'desc'));
    
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryGoal)));
      setLoading(false);
    });
    const unsubObjs = onSnapshot(qObjs, (snapshot) => {
      setObjectives(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryObjective)));
    });
    
    return () => {
      unsubGoals();
      unsubObjs();
    };
  }, []);

  const handleDeleteGoal = async (id: string) => {
    await deleteDoc(doc(db, 'library_goals', id));
  };

  const handleDeleteObjective = async (id: string) => {
    await deleteDoc(doc(db, 'library_objectives', id));
  };

  const filteredGoals = goals.filter(g => g.text.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
        <input 
          type="text"
          placeholder="Search library..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {filteredGoals.map(goal => (
          <div key={goal.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/20">
              <div>
                <h3 className="text-lg font-bold text-white">{goal.text}</h3>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Used {goal.usageCount || 0} times</p>
              </div>
              <button 
                onClick={() => handleDeleteGoal(goal.id)}
                className="p-2 text-slate-600 hover:text-rose-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {objectives.filter(o => o.goalText === goal.text).map(obj => (
                <div key={obj.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-800 group">
                  <p className="text-slate-300 text-sm">{obj.text}</p>
                  <button 
                    onClick={() => handleDeleteObjective(obj.id)}
                    className="p-2 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapView({ client }: { client: any }) {
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client?.uid) return;
    const q = query(collection(db, 'treatment_plans'), where('clientUid', '==', client.uid), where('status', '==', 'active'));
    return onSnapshot(q, (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TreatmentPlan)));
      setLoading(false);
    });
  }, [client.uid]);

  if (loading) return <div className="py-20 text-center text-slate-500">Loading roadmap...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
          <Zap className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight">Your Coaching Roadmap</h3>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {plans.map(plan => (
          <div key={plan.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h4 className="text-lg font-bold text-white mb-6">{plan.goalTitle}</h4>
            <div className="space-y-3">
              {plan.objectives.map((obj, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-800">
                  <p className="text-slate-200 text-sm font-medium">{obj.text}</p>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                    obj.status === 'Achieved' ? "bg-emerald-500/10 text-emerald-500" :
                    obj.status === 'Steady Momentum' ? "bg-blue-500/10 text-blue-500" :
                    obj.status === 'Paused' ? "bg-slate-700 text-slate-400" :
                    "bg-amber-500/10 text-amber-500"
                  )}>
                    {obj.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {plans.length === 0 && (
          <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <Layers className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500">Your coaching roadmap is being prepared.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CoachingDashboardView({ client, onBack }: { client: any; onBack: () => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [metrics, setMetrics] = useState<SubjectiveMetric[]>([]);
  const [reflectionTemplate, setReflectionTemplate] = useState<ReflectionTemplate | null>(null);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [abcEntries, setAbcEntries] = useState<ABCReframing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [showReflectionBuilder, setShowReflectionBuilder] = useState(false);
  const [showReflectionHistory, setShowReflectionHistory] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', targetDate: '', progress: 0 });
  const [newHabit, setNewHabit] = useState({ 
    name: '', 
    frequency: 'Daily', 
    reportingType: 'binary' as Habit['reportingType'],
    targetValue: 0 
  });
  const [newMetric, setNewMetric] = useState({
    name: '',
    scaleMax: 5 as 5 | 7 | 10,
    lowAnchor: '',
    highAnchor: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    type: 'habit' | 'metric' | 'goal';
    name: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (!client?.uid) return;

    const goalsQuery = query(
      collection(db, 'goals'),
      where('clientUid', '==', client.uid),
      orderBy('createdAt', 'desc')
    );

    const habitsQuery = query(
      collection(db, 'habits'),
      where('clientUid', '==', client.uid)
    );

    const metricsQuery = query(
      collection(db, 'subjective_metrics'),
      where('clientUid', '==', client.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubGoals = onSnapshot(goalsQuery, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'goals');
    });

    const unsubHabits = onSnapshot(habitsQuery, (snapshot) => {
      setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Habit)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'habits');
    });

    const unsubMetrics = onSnapshot(metricsQuery, (snapshot) => {
      setMetrics(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubjectiveMetric)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'subjective_metrics');
    });

    const templateQuery = query(
      collection(db, 'reflection_templates'),
      where('clientUid', '==', client.uid),
      limit(1)
    );

    const unsubTemplate = onSnapshot(templateQuery, (snapshot) => {
      if (!snapshot.empty) {
        setReflectionTemplate({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ReflectionTemplate);
      } else {
        setReflectionTemplate(null);
      }
    });

    const reflectionsQuery = query(
      collection(db, 'reflections'),
      where('clientUid', '==', client.uid),
      orderBy('sessionDate', 'desc')
    );

    const unsubReflections = onSnapshot(reflectionsQuery, (snapshot) => {
      setReflections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reflection)));
    });

    const abcQuery = query(
      collection(db, 'abc_reframing'),
      where('clientUid', '==', client.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubAbc = onSnapshot(abcQuery, (snapshot) => {
      setAbcEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ABCReframing)));
    });

    return () => {
      unsubGoals();
      unsubHabits();
      unsubMetrics();
      unsubTemplate();
      unsubReflections();
      unsubAbc();
    };
  }, [client.uid]);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title) return;
    setIsSaving(true);
    try {
      const goalData: any = {
        clientUid: client.uid,
        title: newGoal.title,
        description: newGoal.description,
        status: 'active',
        progress: Number(newGoal.progress),
        createdAt: serverTimestamp()
      };

      if (newGoal.targetDate) {
        goalData.targetDate = newGoal.targetDate;
      }

      await addDoc(collection(db, 'goals'), goalData);
      setShowGoalModal(false);
      setNewGoal({ title: '', description: '', targetDate: '', progress: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'goals');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabit.name) return;
    setIsSaving(true);
    try {
      const habitData: any = {
        clientUid: client.uid,
        name: newHabit.name,
        frequency: newHabit.frequency,
        reportingType: newHabit.reportingType,
        streak: 0,
        history: {},
        createdAt: serverTimestamp()
      };
      
      if (newHabit.reportingType !== 'binary') {
        habitData.targetValue = Number(newHabit.targetValue);
      }

      await addDoc(collection(db, 'habits'), habitData);
      setShowHabitModal(false);
      setNewHabit({ name: '', frequency: 'Daily', reportingType: 'binary', targetValue: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'habits');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMetric.name || !newMetric.lowAnchor || !newMetric.highAnchor) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'subjective_metrics'), {
        clientUid: client.uid,
        name: newMetric.name,
        scaleMax: Number(newMetric.scaleMax),
        lowAnchor: newMetric.lowAnchor,
        highAnchor: newMetric.highAnchor,
        history: {},
        createdAt: serverTimestamp()
      });
      setShowMetricModal(false);
      setNewMetric({ name: '', scaleMax: 5, lowAnchor: '', highAnchor: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'subjective_metrics');
    } finally {
      setIsSaving(false);
    }
  };

  const updateGoalProgress = async (goalId: string, progress: number) => {
    try {
      await updateDoc(doc(db, 'goals', goalId), {
        progress: Math.min(100, Math.max(0, progress)),
        status: progress >= 100 ? 'completed' : 'active'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    }
  };

  const handleSaveTemplate = async (data: Partial<ReflectionTemplate>) => {
    if (!auth.currentUser) return;
    try {
      const templateRef = reflectionTemplate 
        ? doc(db, 'reflection_templates', reflectionTemplate.id)
        : doc(collection(db, 'reflection_templates'));
      
      await setDoc(templateRef, {
        ...data,
        coachUid: auth.currentUser.uid,
        clientUid: client.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowReflectionBuilder(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reflection_templates');
    }
  };

  const lastReflection = reflections[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-brand-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 bg-brand-surface text-slate-400 hover:text-white rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent"
            aria-label="Back to Clients"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Coaching Dashboard</h2>
            <p className="text-slate-400 mt-1">Strategic overview for <span className="text-brand-accent font-semibold">{client.displayName}</span></p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowReflectionBuilder(true)}
            className="flex items-center gap-2 bg-brand-surface text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <Brain className="w-4 h-4" /> Reflection Template
          </button>
          <button 
            onClick={() => setShowHabitModal(true)}
            className="flex items-center gap-2 bg-brand-surface text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <Plus className="w-4 h-4" /> New Habit
          </button>
          <button 
            onClick={() => setShowMetricModal(true)}
            className="flex items-center gap-2 bg-brand-surface text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <Plus className="w-4 h-4" /> New Metric
          </button>
          <button 
            onClick={() => setShowGoalModal(true)}
            className="flex items-center gap-2 bg-brand-accent text-white px-4 py-2 rounded-xl hover:bg-brand-secondary transition-colors shadow-lg shadow-brand-accent/20 focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <Plus className="w-4 h-4" /> New Goal
          </button>
        </div>
      </header>

      <TreatmentPlanModule client={client} user={auth.currentUser} />

      {abcEntries.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">ABC Reframing Logs</h3>
              <p className="text-slate-500 text-xs">Recent cognitive reframing entries from this client</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {abcEntries.map(entry => (
              <div key={entry.id} className="bg-brand-surface border border-slate-800 p-5 rounded-3xl shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Entry from {format(safeToDate(entry.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-600 uppercase mb-1">Situation (A)</p>
                    <p className="text-xs text-slate-400 line-clamp-2">{entry.situation}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-amber-500/50 uppercase mb-1">Thought (B)</p>
                    <p className="text-xs text-slate-400 italic font-serif">"{entry.thoughts}"</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-indigo-500/50 uppercase mb-1">Consequence (C)</p>
                    <p className="text-xs text-slate-400">{entry.consequences}</p>
                  </div>
                  {entry.futureReflection && (
                    <div className="pt-3 border-t border-slate-800">
                      <p className="text-[9px] font-black text-brand-accent/50 uppercase mb-1">Future Self-Talk</p>
                      <p className="text-xs text-brand-accent font-medium line-clamp-2">{entry.futureReflection}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Habit Tracker Section */}
      <section className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Session Reflection Card */}
          <div className="bg-brand-surface border border-slate-800/50 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Session Reflection</h4>
                    <p className="text-xs text-slate-500">Post-session processing tool</p>
                  </div>
                </div>
                <Badge variant={reflectionTemplate?.isEnabled ? 'success' : 'default'}>
                  {reflectionTemplate?.isEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Last Reflection</span>
                  <span className="text-white font-medium">
                    {lastReflection ? format(parseISO(lastReflection.sessionDate), 'MMM d, yyyy') : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total Entries</span>
                  <span className="text-white font-medium">{reflections.length}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowReflectionHistory(true)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-700 transition-all"
              >
                View History
              </button>
              <button 
                onClick={() => setShowReflectionBuilder(true)}
                className="flex-1 py-2.5 bg-brand-accent/10 text-brand-accent border border-brand-accent/20 rounded-xl text-sm font-bold hover:bg-brand-accent/20 transition-all"
              >
                Edit Template
              </button>
            </div>
          </div>

          {/* Quick Stats / Info Card */}
          <div className="bg-brand-surface border border-slate-800/50 p-6 rounded-2xl shadow-xl">
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Strategic Summary</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Active Goals</p>
                  <p className="text-lg font-bold text-white">{goals.filter(g => g.status === 'active').length}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Current Habits</p>
                  <p className="text-lg font-bold text-white">{habits.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Habit Tracker Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
            <ShieldCheck className="w-5 h-5 text-brand-accent" /> Habit Consistency
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.length > 0 ? habits.map(habit => (
            <div key={habit.id} className="bg-brand-surface border border-slate-800/50 p-5 rounded-2xl group relative shadow-xl">
              <button 
                onClick={() => {
                  setDeleteConfirm({
                    id: habit.id,
                    type: 'habit',
                    name: habit.name,
                    onConfirm: async () => {
                      await deleteDoc(doc(db, 'habits', habit.id));
                    }
                  });
                }}
                className="absolute top-4 right-4 p-1 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-rose-500 rounded"
                aria-label={`Delete ${habit.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-white">{habit.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{habit.frequency || 'Daily'}</p>
                    <span className="w-1 h-1 bg-slate-700 rounded-full" />
                    <p className="text-[10px] text-brand-accent uppercase tracking-wider font-bold">{habit.reportingType}</p>
                  </div>
                </div>
                <div className="bg-brand-accent/10 text-brand-accent px-3 py-1 rounded-full text-xs font-bold">
                  {habit.streak} Day Streak
                </div>
              </div>
              <div className="flex gap-1">
                {[...Array(7)].map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "flex-1 h-2 rounded-full",
                      i < (habit.streak % 7 || (habit.streak > 0 ? 7 : 0)) ? "bg-brand-accent" : "bg-slate-800"
                    )}
                  />
                ))}
              </div>
              {habit.reportingType !== 'binary' && habit.targetValue && (
                <p className="mt-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Target: {habit.targetValue} {habit.reportingType}
                </p>
              )}
            </div>
          )) : (
            <div className="col-span-full py-10 bg-brand-surface/50 border border-dashed border-slate-800 rounded-2xl text-center">
              <p className="text-slate-500 text-sm">No habits currently being tracked for this client.</p>
            </div>
          )}
        </div>
      </section>

      {/* Subjective Metrics Section */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
          <Activity className="w-5 h-5 text-brand-accent" /> Subjective Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.length > 0 ? metrics.map(metric => (
            <div key={metric.id} className="bg-brand-surface border border-slate-800/50 p-5 rounded-2xl group relative shadow-xl">
              <button 
                onClick={() => {
                  setDeleteConfirm({
                    id: metric.id,
                    type: 'metric',
                    name: metric.name,
                    onConfirm: async () => {
                      await deleteDoc(doc(db, 'subjective_metrics', metric.id));
                    }
                  });
                }}
                className="absolute top-4 right-4 p-1 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-rose-500 rounded"
                aria-label={`Delete ${metric.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-white">{metric.name}</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mt-1">Scale: 1-{metric.scaleMax}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[8px] text-slate-500 uppercase font-bold tracking-widest">
                  <span>{metric.lowAnchor}</span>
                  <span>{metric.highAnchor}</span>
                </div>
                <div className="h-1.5 bg-brand-focus rounded-full overflow-hidden flex">
                  {[...Array(metric.scaleMax)].map((_, i) => (
                    <div key={i} className="flex-1 border-r border-[#0b1121] last:border-0" />
                  ))}
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-10 bg-brand-surface/50 border border-dashed border-slate-800 rounded-2xl text-center">
              <p className="text-slate-500 text-sm">No subjective metrics set for this client.</p>
            </div>
          )}
        </div>
      </section>

      {/* Long Term Goals Section */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
          <ArrowRight className="w-5 h-5 text-brand-accent" /> Long-Term Goals & Progress
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {goals.length > 0 ? goals.map(goal => (
            <div key={goal.id} className="bg-brand-surface border border-slate-800/50 p-6 rounded-2xl group hover:border-brand-accent/30 transition-all shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-xl font-bold text-white tracking-tight">{goal.title}</h4>
                    <Badge variant={goal.status === 'completed' ? 'success' : 'default'}>
                      {goal.status}
                    </Badge>
                  </div>
                  <p className="text-slate-400 text-sm">{goal.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Target Date</p>
                  <p className="text-white font-medium">{goal.targetDate ? format(parseISO(goal.targetDate), 'MMM d, yyyy') : 'No date set'}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <p className="text-sm font-bold text-slate-300">Progress</p>
                  <p className="text-2xl font-black text-brand-accent">{goal.progress}%</p>
                </div>
                <div className="relative h-4 bg-brand-focus rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${goal.progress}%` }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-accent to-brand-secondary rounded-full"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  {[25, 50, 75, 100].map(val => (
                    <button
                      key={val}
                      onClick={() => updateGoalProgress(goal.id, val)}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent",
                        goal.progress === val 
                          ? "bg-brand-accent text-white" 
                          : "bg-brand-focus text-slate-500 hover:text-white hover:bg-slate-700"
                      )}
                    >
                      {val}%
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button 
                    onClick={() => {
                      setDeleteConfirm({
                        id: goal.id,
                        type: 'goal',
                        name: goal.title,
                        onConfirm: async () => {
                          await deleteDoc(doc(db, 'goals', goal.id));
                        }
                      });
                    }}
                    className="p-1 text-slate-600 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="py-20 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl text-center">
              <FileCheck className="w-12 h-12 text-slate-800 mx-auto mb-4" />
              <p className="text-slate-500">No goals set yet. Click "New Goal" to begin strategic planning.</p>
            </div>
          )}
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showReflectionBuilder && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReflectionBuilder(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <ReflectionTemplateBuilder 
                clientUid={client.uid}
                coachUid={auth.currentUser?.uid || ''}
                template={reflectionTemplate}
                onSave={handleSaveTemplate}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReflectionHistory && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReflectionHistory(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <ReflectionResponseViewer reflections={reflections} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Delete {deleteConfirm.type}?</h3>
              <p className="text-slate-400 mb-8">
                Are you sure you want to delete "<span className="text-white font-semibold">{deleteConfirm.name}</span>"? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await deleteConfirm.onConfirm();
                      setDeleteConfirm(null);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `${deleteConfirm.type}s/${deleteConfirm.id}`);
                    }
                  }}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-500 shadow-lg shadow-rose-600/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Delete {deleteConfirm.type}?</h3>
              <p className="text-slate-400 mb-8">
                Are you sure you want to delete "<span className="text-white font-semibold">{deleteConfirm.name}</span>"? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await deleteConfirm.onConfirm();
                      setDeleteConfirm(null);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `${deleteConfirm.type}s/${deleteConfirm.id}`);
                    }
                  }}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-500 shadow-lg shadow-rose-600/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Goal Modal */}
      <AnimatePresence>
        {showGoalModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSaving && setShowGoalModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Set New Strategic Goal</h3>
              <form onSubmit={handleAddGoal} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Goal Title</label>
                  <input 
                    type="text" 
                    required
                    value={newGoal.title}
                    onChange={e => setNewGoal({ ...newGoal, title: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g., Complete Executive Functioning Module"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Description</label>
                  <textarea 
                    value={newGoal.description}
                    onChange={e => setNewGoal({ ...newGoal, description: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 h-24"
                    placeholder="What does success look like?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Target Date</label>
                    <input 
                      type="date" 
                      value={newGoal.targetDate}
                      onChange={e => setNewGoal({ ...newGoal, targetDate: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Initial Progress (%)</label>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      value={newGoal.progress}
                      onChange={e => setNewGoal({ ...newGoal, progress: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-6">
                  <button 
                    type="button"
                    disabled={isSaving}
                    onClick={() => setShowGoalModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {isSaving ? 'Creating...' : 'Create Goal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Habit Modal */}
      <AnimatePresence>
        {showHabitModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSaving && setShowHabitModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Create Customizable Habit</h3>
              <form onSubmit={handleAddHabit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Habit Name</label>
                  <input 
                    type="text" 
                    required
                    value={newHabit.name}
                    onChange={e => setNewHabit({ ...newHabit, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g., Morning Meditation"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Frequency</label>
                    <select 
                      value={newHabit.frequency}
                      onChange={e => setNewHabit({ ...newHabit, frequency: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    >
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Weekdays</option>
                      <option>Weekends</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Reporting Type</label>
                    <select 
                      value={newHabit.reportingType}
                      onChange={e => setNewHabit({ ...newHabit, reportingType: e.target.value as Habit['reportingType'] })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="binary">Yes / No</option>
                      <option value="count">Count (Numerical)</option>
                      <option value="minutes">Minutes</option>
                      <option value="miles">Miles</option>
                      <option value="percent">Percent</option>
                      <option value="servings">Servings</option>
                    </select>
                  </div>
                </div>
                {newHabit.reportingType !== 'binary' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Daily Target Value</label>
                    <input 
                      type="number" 
                      value={newHabit.targetValue}
                      onChange={e => setNewHabit({ ...newHabit, targetValue: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
                <div className="flex gap-3 pt-6">
                  <button 
                    type="button"
                    disabled={isSaving}
                    onClick={() => setShowHabitModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {isSaving ? 'Creating...' : 'Create Habit'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subjective Metric Modal */}
      <AnimatePresence>
        {showMetricModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSaving && setShowMetricModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Create Subjective Metric</h3>
              <form onSubmit={handleAddMetric} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Metric Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Stress Level"
                    value={newMetric.name}
                    onChange={e => setNewMetric({ ...newMetric, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Scale Range</label>
                  <select 
                    value={newMetric.scaleMax}
                    onChange={e => setNewMetric({ ...newMetric, scaleMax: Number(e.target.value) as any })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={5}>1 - 5</option>
                    <option value={7}>1 - 7</option>
                    <option value={10}>1 - 10</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Low Anchor (1)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Completely Drained"
                      value={newMetric.lowAnchor}
                      onChange={e => setNewMetric({ ...newMetric, lowAnchor: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">High Anchor ({newMetric.scaleMax})</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Fully Charged"
                      value={newMetric.highAnchor}
                      onChange={e => setNewMetric({ ...newMetric, highAnchor: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-6">
                  <button 
                    type="button"
                    disabled={isSaving}
                    onClick={() => setShowMetricModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {isSaving ? 'Creating...' : 'Create Metric'}
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
                className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-brand-accent transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-brand-accent rounded"
              >
                {showInactiveInChat ? 'Hide Inactive' : `Show Inactive (${inactiveClients.length})`}
              </button>
            </div>
          )}
          <div className="space-y-2 overflow-y-auto flex-1 pr-2 no-scrollbar">
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
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all border focus:outline-none focus:ring-2 focus:ring-brand-accent",
                      selectedClient === client.uid 
                        ? "bg-brand-accent/10 border-brand-accent/50 text-white" 
                        : "bg-brand-surface border-slate-700/30 text-slate-400 hover:bg-slate-800/50"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold shrink-0">
                        {client.displayName[0]}
                      </div>
                      <span className="text-sm font-medium truncate">{client.displayName}</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="bg-brand-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
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
              className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 no-scrollbar"
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
                          ? "bg-brand-accent text-white rounded-tr-none" 
                          : "bg-brand-surface text-slate-200 rounded-tl-none border border-slate-700"
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
                              "mt-3 flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-white",
                              isMe ? "bg-white/10 hover:bg-white/20" : "bg-brand-focus hover:bg-slate-900"
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

            <form onSubmit={handleSend} className="flex gap-2 pt-4 border-t border-slate-800/50">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="bg-brand-accent text-white p-3 rounded-xl hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                aria-label="Send message"
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
  const [forcedSiteView, setForcedSiteView] = useState<'auto' | 'portal' | 'tools'>('auto');

  const isToolsSite = useMemo(() => {
    if (forcedSiteView === 'tools') return true;
    if (forcedSiteView === 'portal') return false;
    // In AI Studio preview, we can toggle this for testing, but in production it will detect the domain
    return window.location.hostname.includes('tools') || window.location.hostname.includes('mrleeteaches-tools');
  }, [forcedSiteView]);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    if (isToolsSite) {
      setActiveTab('tools');
    }
  }, [isToolsSite]);

  const [loading, setLoading] = useState(true);
  const [selectedCoachingClient, setSelectedCoachingClient] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showLateNoticeModal, setShowLateNoticeModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showABCReframingModal, setShowABCReframingModal] = useState(false);
  const [showBrainDumpModal, setShowBrainDumpModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => {
    const handleOpenABC = () => setShowABCReframingModal(true);
    window.addEventListener('open-abc-reframing', handleOpenABC);
    return () => window.removeEventListener('open-abc-reframing', handleOpenABC);
  }, []);

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
  const [openTool, setOpenTool] = useState<{ name: string; type: 'basic' | 'advanced'; component: React.ReactNode } | null>(null);
  
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
  const [clientHabits, setClientHabits] = useState<Habit[]>([]);
  const [clientMetrics, setClientMetrics] = useState<SubjectiveMetric[]>([]);
  const [clientReflectionTemplate, setClientReflectionTemplate] = useState<ReflectionTemplate | null>(null);
  const [clientReflections, setClientReflections] = useState<Reflection[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(false);

  const [selectedReflectionAppointment, setSelectedReflectionAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setShowAuthModal(false);
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

  // Fetch client habits and metrics
  useEffect(() => {
    if (!user || !profile || profile.role !== 'client') return;

    setHabitsLoading(true);
    const habitsQuery = query(collection(db, 'habits'), where('clientUid', '==', user.uid));
    const metricsQuery = query(collection(db, 'subjective_metrics'), where('clientUid', '==', user.uid));

    const unsubHabits = onSnapshot(habitsQuery, (snapshot) => {
      setClientHabits(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Habit)));
      setHabitsLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'habits'));

    const unsubMetrics = onSnapshot(metricsQuery, (snapshot) => {
      setClientMetrics(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SubjectiveMetric)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'subjective_metrics'));

    const templateQuery = query(
      collection(db, 'reflection_templates'),
      where('clientUid', '==', user.uid),
      limit(1)
    );

    const unsubTemplate = onSnapshot(templateQuery, (snapshot) => {
      if (!snapshot.empty) {
        setClientReflectionTemplate({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ReflectionTemplate);
      } else {
        setClientReflectionTemplate(null);
      }
    });

    const reflectionsQuery = query(
      collection(db, 'reflections'),
      where('clientUid', '==', user.uid),
      orderBy('sessionDate', 'desc')
    );

    const unsubReflections = onSnapshot(reflectionsQuery, (snapshot) => {
      setClientReflections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reflection)));
    });

    return () => {
      unsubHabits();
      unsubMetrics();
      unsubTemplate();
      unsubReflections();
    };
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
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (result.user) {
        setShowAuthModal(false);
      }
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

  const openAction = React.useCallback((appt: any, type: 'cancel' | 'reschedule' | 'coaching-tools') => {
    if (type === 'coaching-tools') {
      const client = clients.find((c: any) => c.email === appt.clientEmail);
      if (client) {
        setSelectedCoachingClient(client);
        setActiveTab('coaching-dashboard');
      } else {
        alert('Client profile not found for this appointment.');
      }
      return;
    }
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

  // Session Reflection Trigger Logic
  useEffect(() => {
    if (profile?.role !== 'client' || !clientReflectionTemplate?.isEnabled) return;

    const checkReflections = async () => {
      const now = new Date();
      const thirtyMinsAgo = addHours(now, -0.5);
      const sixtyMinsAgo = addHours(now, -1);

      const recentAppts = appointments.filter((a: any) => {
        const end = safeToDate(a.endTime);
        return isBefore(end, thirtyMinsAgo) && isAfter(end, sixtyMinsAgo) && a.status === 'completed';
      });

      for (const appt of recentAppts) {
        const hasReflection = clientReflections.some(r => r.appointmentId === appt.id);
        if (!hasReflection) {
          if (notificationPermission === 'granted') {
            new Notification('Session Reflection', {
              body: `How did your session go? Take a moment to reflect on your progress.`,
              icon: '/logo.png'
            });
          }
        }
      }
    };

    const interval = setInterval(checkReflections, 60000);
    checkReflections();
    return () => clearInterval(interval);
  }, [appointments, clientReflections, clientReflectionTemplate, profile, notificationPermission]);

  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen bg-brand-focus flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!user && !isToolsSite) {
    return (
      <div className="min-h-screen bg-brand-focus flex items-center justify-center p-4">
        <AuthSection 
          authMode={authMode}
          setAuthMode={setAuthMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          displayName={displayName}
          setDisplayName={setDisplayName}
          authError={authError}
          authMessage={authMessage}
          handleEmailAuth={handleEmailAuth}
          handleGoogleLogin={handleGoogleLogin}
        />
      </div>
    );
  }

  if (profile?.role === 'client' && !profile?.isOnboarded && !showPasswordChange) {
    return <OnboardingView user={user} onComplete={() => {
      setProfile(prev => prev ? { ...prev, isOnboarded: true } : null);
    }} />;
  }

  const handleSaveReflection = async (responses: Record<string, string>, status: 'draft' | 'submitted') => {
    if (!user || !selectedReflectionAppointment) return;
    try {
      const existing = clientReflections.find(r => r.appointmentId === selectedReflectionAppointment.id);
      const reflectionRef = existing 
        ? doc(db, 'reflections', existing.id)
        : doc(collection(db, 'reflections'));
      
      await setDoc(reflectionRef, {
        clientUid: user.uid,
        appointmentId: selectedReflectionAppointment.id,
        sessionDate: format(safeToDate(selectedReflectionAppointment.startTime), 'yyyy-MM-dd'),
        responses,
        status,
        updatedAt: serverTimestamp(),
        createdAt: existing ? existing.createdAt : serverTimestamp()
      }, { merge: true });

      if (status === 'submitted') {
        setActiveTab('dashboard');
        setSelectedReflectionAppointment(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reflections');
    }
  };

  const renderContent = () => {
    if (isToolsSite && activeTab === 'dashboard') {
      return <GettingStartedView isToolsSite={true} setActiveTab={setActiveTab} />;
    }
    if (isToolsSite && activeTab === 'privacy') {
      return <PrivacyVaultView />;
    }

    switch (activeTab) {
      case 'dashboard': return (
        <DashboardView 
          user={user}
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
          onOpenCheckIn={() => setShowCheckInModal(true)}
          habits={clientHabits}
          metrics={clientMetrics}
          reflectionTemplate={clientReflectionTemplate}
          reflections={clientReflections}
          notificationPermission={notificationPermission}
          onRequestNotifications={requestNotificationPermission}
          onOpenReflection={(appt: Appointment) => {
            setSelectedReflectionAppointment(appt);
            setActiveTab('reflection');
          }}
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
          setSelectedCoachingClient={setSelectedCoachingClient}
          setActiveTab={setActiveTab}
        />
      );
      case 'coaching-dashboard': return selectedCoachingClient ? (
        <CoachingDashboardView 
          client={selectedCoachingClient}
          onBack={() => {
            setActiveTab('clients');
            setSelectedCoachingClient(null);
          }}
        />
      ) : null;
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
      case 'tools': return <ToolsLibraryView user={user} setActiveTab={setActiveTab} onOpenABC={() => user ? setShowABCReframingModal(true) : setShowAuthModal(true)} onOpenBrainDump={() => user ? setShowBrainDumpModal(true) : setShowAuthModal(true)} onOpenTool={(name, type, component) => setOpenTool({ name, type, component })} onOpenAuth={() => setShowAuthModal(true)} />;
      case 'documents': return <DocumentsView documents={documents} role={profile?.role} user={user} />;
      case 'reflection': return (
        clientReflectionTemplate && selectedReflectionAppointment ? (
          <ReflectionEntryView 
            template={clientReflectionTemplate}
            appointment={selectedReflectionAppointment}
            existingReflection={clientReflections.find(r => r.appointmentId === selectedReflectionAppointment.id) || null}
            onSave={handleSaveReflection}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Brain className="w-12 h-12 mb-4 opacity-20" />
            <p>No reflection template found or session selected.</p>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className="mt-4 text-brand-accent font-bold hover:underline"
            >
              Back to Dashboard
            </button>
          </div>
        )
      );
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
      case 'dear-man': return <DearManMastery user={user} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-brand-focus text-slate-200 flex">
      <ToolModal 
        isOpen={!!openTool} 
        onClose={() => setOpenTool(null)} 
        title={openTool?.name || ''}
        type={openTool?.type || 'basic'}
      >
        {openTool?.component}
      </ToolModal>
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-brand-accent text-white p-3 rounded-lg z-[150] font-bold outline-none ring-2 ring-white"
      >
        Skip to main content
      </a>

      {/* Sidebar - Desktop */}
      <aside className={isToolsSite 
        ? "hidden lg:flex flex-col w-64 bg-[#0b1121] border-r border-slate-800/50 overflow-y-auto no-scrollbar"
        : "hidden lg:flex flex-col w-72 bg-[#0b1121] border-r border-slate-800/50 p-6 overflow-y-auto"}>
        {isToolsSite ? (
          <div className="p-6 flex items-start border-b border-slate-800/50 mb-4 animate-in fade-in slide-in-from-left duration-500">
            <div className="w-12 h-12 rounded-full border border-slate-700 overflow-hidden shrink-0 mr-3 shadow-sm bg-brand-focus">
              <img 
                src="https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png" 
                alt="Mr. Lee Teaches Logo" 
                className="w-full h-full object-cover"
              />
            </div>
            
            <div className="flex flex-col min-w-0 pt-0.5">
              <h1 className="text-lg font-bold text-white tracking-tight leading-none mb-2">MrLeeTeaches</h1>
              
              <div className="flex flex-col gap-1.5 text-[11px] font-medium text-slate-300">
                <span className="truncate block">
                  <span aria-hidden="true" className="mr-0.5">💬</span> Neurodivergent Advocate
                </span>
                <div className="flex items-center gap-1.5 truncate">
                  <span><span aria-hidden="true" className="mr-0.5">🗣️</span> Speaker</span>
                  <span className="text-slate-600" aria-hidden="true">|</span>
                  <span><span aria-hidden="true" className="mr-0.5">🤯</span> Consultant</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 mb-10 px-2 hover:opacity-80 transition-opacity text-left focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-xl"
          >
            <div className="w-10 h-10">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-full h-full object-contain rounded-xl"
                onError={(e) => {
                  e.currentTarget.src = 'https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png';
                }}
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">MrLeeTeaches</h1>
              <p className="text-brand-accent text-[10px] font-bold uppercase tracking-wider mt-1">Neurodiversity Coaching</p>
            </div>
          </button>
        )}

        <nav className={`flex-1 space-y-2 ${isToolsSite ? 'px-4' : ''}`}>
          {!isToolsSite ? (
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          ) : (
            <SidebarItem icon={Zap} label="Getting Started" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          )}

          {!isToolsSite && <SidebarItem icon={Calendar} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />}
          
          {profile?.role === 'client' && clientReflectionTemplate?.isEnabled && !isToolsSite && (
            <SidebarItem 
              icon={Brain} 
              label="Session Reflection" 
              active={activeTab === 'reflection'} 
              onClick={() => setActiveTab('reflection')} 
              badge={clientReflections.some(r => r.status === 'draft') ? 1 : undefined}
            />
          )}
          <SidebarItem icon={Wrench} label="Tools Library" active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
          
          {user && (
            <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          )}
          
          {isToolsSite && (
            <SidebarItem icon={ShieldCheck} label="Privacy Vault" active={activeTab === 'privacy'} onClick={() => setActiveTab('privacy')} />
          )}

          {!isToolsSite && profile?.role === 'coach' && (
            <>
              <SidebarItem icon={Users} label="Clients" active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
              <SidebarItem icon={Library} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
            </>
          )}
          
          {!isToolsSite && (
            <>
              <SidebarItem 
                icon={MessageSquare} 
                label="Messages" 
                active={activeTab === 'messages'} 
                onClick={() => setActiveTab('messages')} 
                badge={messages.filter(m => m.receiverUid === user?.uid && !m.isRead).length || undefined}
              />
              <SidebarItem icon={FileText} label="Documents" active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} />
              <SidebarItem icon={Bell} label="Reminders" active={activeTab === 'reminders'} onClick={() => setActiveTab('reminders')} />
            </>
          )}
          
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className={`mt-auto pt-6 ${isToolsSite ? 'px-4' : ''} border-t border-slate-800/50 pb-6`}>
          {isToolsSite && (
            <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mb-6 group hover:border-indigo-500/30 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 p-0.5 bg-brand-focus rounded-full border border-slate-700 overflow-hidden shadow-sm">
                  <img src="https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png" className="w-full h-full object-cover" alt="Coach Logo" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white leading-tight">Mr. Lee Teaches</h4>
                  <p className="text-[10px] text-indigo-400 font-medium">Coaching Services</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Finding these tools helpful? Visit my site for more resources, blog posts, or to request a Discovery Call to work together.
              </p>
              <a 
                href="https://mrleeteaches.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group flex items-center justify-between py-2 text-brand-accent text-xs font-bold hover:text-white transition-colors"
              >
                Visit Website
                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </a>
              <a 
                href="https://mrleeteaches.com/privacypolicy/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between py-1 text-slate-500 hover:text-white transition-colors text-[10px] font-medium"
              >
                Privacy & Terms
                <ExternalLink className="w-2.5 h-2.5 opacity-50" />
              </a>
            </div>
          )}

          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-10 h-10 rounded-full bg-brand-surface flex items-center justify-center text-brand-accent font-bold overflow-hidden border border-slate-700">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                user?.displayName?.[0] || user?.email?.[0].toUpperCase() || '?'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.displayName || (user ? 'User' : 'Guest')}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{profile?.role || (user ? '' : 'Public Access')}</p>
            </div>
          </div>
          {user ? (
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/5 rounded-xl transition-all duration-200"
            >
              <UserIcon className="w-5 h-5" />
              <span className="font-medium">Sign In</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#0b1121] border-b border-slate-800/50 flex items-center justify-between px-4 z-50">
        {isToolsSite ? (
          <div className="flex items-center gap-4 w-full">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)} 
              aria-label="Toggle menu"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg font-black text-white tracking-tight leading-none mb-0.5">Tools Library</h1>
              <p className="text-[9px] text-slate-400 font-medium truncate italic">Custom Built Apps</p>
            </div>
          </div>
        ) : (
          <>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-lg"
            >
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-8 h-8 object-contain rounded-lg"
                onError={(e) => {
                  e.currentTarget.src = 'https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png';
                }}
              />
              <div>
                <span className="font-bold text-white block leading-none">MrLeeTeaches</span>
                <span className="text-brand-accent text-[8px] font-bold uppercase tracking-wider">Neurodiversity Coaching</span>
              </div>
            </button>
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)} 
              aria-label="Toggle menu"
              className="p-2 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-lg"
            >
              {sidebarOpen ? <X /> : <Menu />}
            </button>
          </>
        )}
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
              className="fixed inset-y-0 left-0 w-72 bg-[#0b1121] z-50 p-6 lg:hidden border-r border-slate-800/50 flex flex-col overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                {isToolsSite ? (
                  <div className="flex items-start">
                    <div className="w-12 h-12 rounded-full border border-slate-700 overflow-hidden shrink-0 mr-3 shadow-sm bg-brand-focus">
                      <img 
                        src="https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png" 
                        alt="Mr. Lee Teaches Logo" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="flex flex-col min-w-0 pt-0.5">
                      <h1 className="text-lg font-bold text-white tracking-tight leading-none mb-2">MrLeeTeaches</h1>
                      
                      <div className="flex flex-col gap-1.5 text-[11px] font-medium text-slate-300">
                        <span className="truncate block">
                          <span aria-hidden="true" className="mr-0.5">💬</span> Neurodivergent Advocate
                        </span>
                        <div className="flex items-center gap-1.5 truncate">
                          <span><span aria-hidden="true" className="mr-0.5">🗣️</span> Speaker</span>
                          <span className="text-slate-600" aria-hidden="true">|</span>
                          <span><span aria-hidden="true" className="mr-0.5">🤯</span> Consultant</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left outline-none"
                  >
                    <img src="/logo.png" className="w-10 h-10 object-contain rounded-xl" alt="Logo" />
                    <div>
                      <h1 className="text-lg font-bold text-white tracking-tight leading-none">MrLeeTeaches</h1>
                      <p className="text-brand-accent text-[10px] font-bold uppercase tracking-wider mt-1">Coaching Portal</p>
                    </div>
                  </button>
                )}
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-lg self-start">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="flex-1 space-y-2">
                {!isToolsSite ? (
                  <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
                ) : (
                  <SidebarItem icon={Zap} label="Getting Started" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
                )}

                {!isToolsSite && <SidebarItem icon={Calendar} label="Calendar" active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setSidebarOpen(false); }} />}
                
                {profile?.role === 'client' && clientReflectionTemplate?.isEnabled && !isToolsSite && (
                  <SidebarItem 
                    icon={Brain} 
                    label="Session Reflection" 
                    active={activeTab === 'reflection'} 
                    onClick={() => { setActiveTab('reflection'); setSidebarOpen(false); }} 
                    badge={clientReflections.some(r => r.status === 'draft') ? 1 : undefined}
                  />
                )}
                
                <SidebarItem icon={Wrench} label="Tools Library" active={activeTab === 'tools'} onClick={() => { setActiveTab('tools'); setSidebarOpen(false); }} />
                
                {user && (
                  <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }} />
                )}
                
                {isToolsSite && (
                  <SidebarItem icon={ShieldCheck} label="Privacy Vault" active={activeTab === 'privacy'} onClick={() => { setActiveTab('privacy'); setSidebarOpen(false); }} />
                )}

                {!isToolsSite && profile?.role === 'coach' && (
                  <>
                    <SidebarItem icon={Users} label="Clients" active={activeTab === 'clients'} onClick={() => { setActiveTab('clients'); setSidebarOpen(false); }} />
                    <SidebarItem icon={Library} label="Library" active={activeTab === 'library'} onClick={() => { setActiveTab('library'); setSidebarOpen(false); }} />
                  </>
                )}

                {!isToolsSite && (
                  <>
                    <SidebarItem 
                      icon={MessageSquare} 
                      label="Messages" 
                      active={activeTab === 'messages'} 
                      onClick={() => { setActiveTab('messages'); setSidebarOpen(false); }} 
                      badge={messages.filter(m => m.receiverUid === user?.uid && !m.isRead).length || undefined}
                    />
                    <SidebarItem icon={FileText} label="Documents" active={activeTab === 'documents'} onClick={() => { setActiveTab('documents'); setSidebarOpen(false); }} />
                    <SidebarItem icon={Bell} label="Reminders" active={activeTab === 'reminders'} onClick={() => { setActiveTab('reminders'); setSidebarOpen(false); }} />
                  </>
                )}

                <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }} />
              </nav>

              <div className="mt-8 pt-6 border-t border-slate-800/50 space-y-6">
                {isToolsSite && (
                  <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mb-2 group hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 p-0.5 bg-brand-focus rounded-full border border-slate-700 overflow-hidden shadow-sm">
                        <img src="https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png" className="w-full h-full object-cover" alt="Coach Logo" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white leading-tight">Mr. Lee Teaches</h4>
                        <p className="text-[10px] text-indigo-400 font-medium">Coaching Services</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                      Finding these tools helpful? Visit my site for more resources, blog posts, or to request a Discovery Call to work together.
                    </p>
                    <a 
                      href="https://mrleeteaches.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between py-2 text-brand-accent text-xs font-bold hover:text-white transition-colors"
                    >
                      Visit Website
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </a>
                    <a 
                      href="https://mrleeteaches.com/privacypolicy/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between py-1 text-slate-500 hover:text-white transition-colors text-[10px] font-medium"
                    >
                      Privacy & Terms
                      <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-6 px-2">
                  <div className="w-10 h-10 rounded-full bg-brand-surface flex items-center justify-center text-brand-accent font-bold overflow-hidden border border-slate-700">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      user?.displayName?.[0] || user?.email?.[0].toUpperCase() || '?'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user?.displayName || (user ? 'User' : 'Guest')}</p>
                    <p className="text-xs text-slate-500 truncate capitalize">{profile?.role || (user ? '' : 'Public Access')}</p>
                  </div>
                </div>
                {user ? (
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 rounded-xl transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Sign Out</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => { setShowAuthModal(true); setSidebarOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/5 rounded-xl transition-all"
                  >
                    <UserIcon className="w-5 h-5" />
                    <span className="font-medium">Sign In</span>
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main id="main-content" className="flex-1 lg:p-8 p-4 pt-20 lg:pt-8 overflow-y-auto outline-none">
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

      {profile && (
        <ABCReframingModal 
          client={profile} 
          user={user} 
          isOpen={showABCReframingModal} 
          onClose={() => setShowABCReframingModal(false)} 
          isToolsSite={isToolsSite}
        />
      )}

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

      {/* Daily Check-in Modal */}
      <AnimatePresence>
        {showCheckInModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckInModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl scrollbar-hide"
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">Daily Check-in</h2>
                  <p className="text-slate-400 text-lg">Complete your daily tracking and reflection.</p>
                </div>
                <button 
                  onClick={() => setShowCheckInModal(false)}
                  className="p-3 bg-slate-900 text-slate-400 rounded-2xl hover:text-white transition-colors border border-slate-800"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <HabitTrackerView user={user!} onOpenABC={() => setShowABCReframingModal(true)} />
                </div>
                <div className="space-y-8">
                  <SubjectiveMetricsTrackerView user={user!} />
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-slate-800 flex justify-center">
                <button 
                  onClick={() => setShowCheckInModal(false)}
                  className="px-12 py-4 bg-brand-accent text-white rounded-2xl font-bold text-lg hover:bg-brand-secondary transition-all shadow-xl shadow-brand-accent/20 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-slate-950"
                >
                  Done for Today
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Brain Dump Modal */}
      <AnimatePresence>
        {showBrainDumpModal && user && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBrainDumpModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl transition-all"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center">
                    <BrainCircuit className="w-6 h-6 text-brand-accent" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Frictionless Brain Dump</h2>
                </div>
                <button 
                  onClick={() => setShowBrainDumpModal(false)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <BrainDump user={user} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth Modal for Tools Site */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md"
            >
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute -top-12 right-0 p-2 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
              <AuthSection 
                authMode={authMode}
                setAuthMode={setAuthMode}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                displayName={displayName}
                setDisplayName={setDisplayName}
                authError={authError}
                authMessage={authMessage}
                handleEmailAuth={async (e: React.FormEvent) => {
                  try {
                    await handleEmailAuth(e);
                  } catch(err) {}
                }}
                handleGoogleLogin={async () => {
                  try {
                    await handleGoogleLogin();
                  } catch(err) {}
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Auth Section Component ---
function AuthSection({ 
  authMode, setAuthMode, email, setEmail, password, setPassword, 
  displayName, setDisplayName, authError, authMessage, handleEmailAuth, handleGoogleLogin 
}: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md w-full bg-brand-surface border border-slate-800/50 rounded-3xl p-8 shadow-2xl"
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 mb-6">
          <img 
            src="/logo.png" 
            alt="MrLeeTeaches Logo" 
            className="w-full h-full object-contain rounded-2xl"
            onError={(e) => {
              e.currentTarget.src = 'https://mrleeteaches.com/wp-content/uploads/2026/03/logo.png';
            }}
          />
        </div>
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">MrLeeTeaches</h1>
        <p className="text-brand-accent font-medium text-sm mb-4">Neurodiversity Coaching</p>
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
          <div className="w-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-sm p-3 rounded-xl mb-6">
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
              className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          )}
          <input
            type="email"
            placeholder="Email Address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
          {authMode !== 'forgot' && (
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          )}
          <button
            type="submit"
            className="w-full bg-brand-accent text-white font-semibold py-3 rounded-xl hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-surface"
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
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 rounded-xl hover:bg-slate-100 transition-all duration-200 shadow-lg shadow-white/5 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Continue with Google
            </button>
          </>
        )}

        <div className="mt-8 flex flex-col gap-2">
          {authMode === 'login' ? (
            <>
              <button onClick={() => setAuthMode('signup')} className="text-sm text-brand-accent hover:underline focus:outline-none focus:ring-2 focus:ring-brand-accent rounded">
                Don't have an account? Sign up
              </button>
              <button onClick={() => setAuthMode('forgot')} className="text-sm text-slate-500 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-accent rounded">
                Forgot password?
              </button>
            </>
          ) : (
            <button onClick={() => setAuthMode('login')} className="text-sm text-brand-accent hover:underline focus:outline-none focus:ring-2 focus:ring-brand-accent rounded">
              Back to login
            </button>
          )}
        </div>
        
        <p className="mt-8 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
          MrLeeTeaches Coaching Portal
        </p>
        <a 
          href="https://mrleeteaches.com/privacypolicy/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-4 text-[10px] text-slate-500 hover:text-brand-accent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent rounded"
        >
          Privacy Policy
        </a>
      </div>
    </motion.div>
  );
}

// --- View Components ---

// --- Habit Tracker Component ---

function HabitTrackerView({ user, onOpenABC }: { user: User; onOpenABC?: () => void }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(collection(db, 'habits'), where('clientUid', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Habit)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'habits');
    });
    return () => unsub();
  }, [user.uid]);

  const handleReport = async (habit: Habit, value: any) => {
    setSubmitting(habit.id);
    const today = format(new Date(), 'yyyy-MM-dd');
    const history = { ...(habit.history || {}), [today]: value };
    
    // Calculate streak
    let streak = 0;
    let checkDate = new Date();
    while (true) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      if (history[dateStr] !== undefined) {
        streak++;
        checkDate = addHours(checkDate, -24);
      } else {
        break;
      }
    }

    try {
      await updateDoc(doc(db, 'habits', habit.id), {
        history,
        streak,
        lastCompleted: today
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `habits/${habit.id}`);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return <div className="py-10 text-center text-slate-500">Loading habits...</div>;
  if (habits.length === 0) return null;

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <Card title="Daily Habit Tracker" subtitle="Stay consistent with your goals">
      <div className="space-y-4">
        {habits.map(habit => {
          const isCompletedToday = habit.history?.[today] !== undefined;
          return (
            <div key={habit.id} className="bg-slate-800/30 border border-slate-700/30 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-white">{habit.name}</h4>
                  {isCompletedToday && <CheckCircle2 className="w-4 h-4 text-brand-accent" />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{habit.frequency || 'Daily'}</p>
                  <span className="w-1 h-1 bg-slate-700 rounded-full" />
                  <p className="text-[10px] text-brand-accent font-bold">{habit.streak} Day Streak</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {habit.name.toLowerCase().includes('abc reframe') && (
                  <button
                    onClick={() => {
                      if (onOpenABC) onOpenABC();
                      else window.dispatchEvent(new CustomEvent('open-abc-reframing'));
                    }}
                    className="p-2 text-brand-accent hover:bg-brand-accent/10 rounded-xl transition-all"
                    title="Open ABC Reframing Tool"
                  >
                    <Activity className="w-5 h-5" />
                  </button>
                )}
                {habit.reportingType === 'binary' ? (
                  <button
                    disabled={submitting === habit.id || isCompletedToday}
                    onClick={() => handleReport(habit, true)}
                    className={cn(
                      "px-6 py-2 rounded-xl font-bold transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-surface",
                      isCompletedToday 
                        ? "bg-brand-accent/20 text-brand-accent border border-brand-accent/20" 
                        : "bg-brand-accent text-white hover:bg-brand-secondary shadow-lg shadow-brand-accent/20"
                    )}
                  >
                    {submitting === habit.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : isCompletedToday ? 'Completed' : 'Mark Done'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input 
                        type="number"
                        disabled={submitting === habit.id || isCompletedToday}
                        placeholder={habit.targetValue?.toString() || "0"}
                        value={isCompletedToday ? habit.history?.[today] : (inputValue[habit.id] || '')}
                        onChange={e => setInputValue({ ...inputValue, [habit.id]: e.target.value })}
                        className="w-24 bg-brand-focus border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-brand-accent focus:outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 uppercase">
                        {habit.reportingType}
                      </span>
                    </div>
                    {!isCompletedToday && (
                      <button
                        disabled={submitting === habit.id || !inputValue[habit.id]}
                        onClick={() => handleReport(habit, Number(inputValue[habit.id]))}
                        className="bg-brand-accent text-white p-2 rounded-xl hover:bg-brand-secondary transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                      >
                        {submitting === habit.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SubjectiveMetricsTrackerView({ user }: { user: User }) {
  const [metrics, setMetrics] = useState<SubjectiveMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    const q = query(collection(db, 'subjective_metrics'), where('clientUid', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedMetrics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubjectiveMetric));
      setMetrics(fetchedMetrics);
      
      // Initialize values for sliders if not already set
      const initialValues: Record<string, number> = {};
      const today = format(new Date(), 'yyyy-MM-dd');
      fetchedMetrics.forEach(m => {
        if (m.history?.[today] !== undefined) {
          initialValues[m.id] = m.history[today];
        } else if (values[m.id] === undefined) {
          initialValues[m.id] = Math.ceil(m.scaleMax / 2);
        }
      });
      setValues(prev => ({ ...initialValues, ...prev }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'subjective_metrics');
    });
    return () => unsub();
  }, [user.uid]);

  const handleReport = async (metric: SubjectiveMetric) => {
    setSubmitting(metric.id);
    const today = format(new Date(), 'yyyy-MM-dd');
    const val = values[metric.id] ?? Math.ceil(metric.scaleMax / 2);
    const history = { ...(metric.history || {}), [today]: val };
    
    try {
      await updateDoc(doc(db, 'subjective_metrics', metric.id), {
        history,
        lastCompleted: today
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `subjective_metrics/${metric.id}`);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return <div className="py-10 text-center text-slate-500">Loading metrics...</div>;
  if (metrics.length === 0) return null;

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <Card title="Subjective Metrics" subtitle="Track how you're feeling today">
      <div className="space-y-8">
        {metrics.map(metric => {
          const isCompletedToday = metric.history?.[today] !== undefined;
          const currentValue = values[metric.id] ?? Math.ceil(metric.scaleMax / 2);

          return (
            <div key={metric.id} className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-white flex items-center gap-2 tracking-tight">
                  {metric.name}
                  {isCompletedToday && <CheckCircle2 className="w-4 h-4 text-brand-accent" />}
                </h4>
                <span className="text-brand-accent font-mono font-bold bg-brand-accent/10 px-3 py-1 rounded-full text-sm">
                  {isCompletedToday ? metric.history[today] : currentValue} / {metric.scaleMax}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                  <span>{metric.lowAnchor}</span>
                  <span>{metric.highAnchor}</span>
                </div>
                <div className="relative pt-2 pb-6">
                  <input
                    type="range"
                    min="1"
                    max={metric.scaleMax}
                    step="1"
                    disabled={submitting === metric.id || isCompletedToday}
                    value={isCompletedToday ? metric.history[today] : currentValue}
                    onChange={(e) => setValues({ ...values, [metric.id]: parseInt(e.target.value) })}
                    className="w-full h-2 bg-brand-focus rounded-lg appearance-none cursor-pointer accent-brand-accent disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-accent"
                    aria-label={`Rate ${metric.name} from 1 to ${metric.scaleMax}`}
                  />
                  <div className="absolute left-0 right-0 top-6 flex justify-between px-1">
                    {[...Array(metric.scaleMax)].map((_, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className="w-0.5 h-1.5 bg-slate-700 mb-1" />
                        <span className="text-[8px] text-slate-600 font-bold">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {!isCompletedToday && (
                <button
                  disabled={submitting === metric.id}
                  onClick={() => handleReport(metric)}
                  className="w-full bg-brand-surface text-white py-2 rounded-xl font-bold hover:bg-slate-700 transition-all border border-slate-700 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                >
                  {submitting === metric.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Log Response
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// --- Session Reflection Components ---

const ReflectionTemplateBuilder = ({ 
  clientUid, 
  coachUid, 
  template, 
  onSave 
}: { 
  clientUid: string; 
  coachUid: string; 
  template: ReflectionTemplate | null; 
  onSave: (data: Partial<ReflectionTemplate>) => void 
}) => {
  const [questions, setQuestions] = useState<string[]>(template?.questions || [
    "What was your biggest takeaway?",
    "What is one hurdle you anticipate this week?",
    "What do you need from our next session?"
  ]);
  const [isEnabled, setIsEnabled] = useState(template?.isEnabled ?? true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({ questions, isEnabled });
    setIsSaving(false);
  };

  const addQuestion = () => setQuestions([...questions, ""]);
  const removeQuestion = (index: number) => setQuestions(questions.filter((_, i) => i !== index));
  const updateQuestion = (index: number, value: string) => {
    const next = [...questions];
    next[index] = value;
    setQuestions(next);
  };

  return (
    <Card title="Reflection Template Builder" subtitle="Customize the questions your client sees after each session">
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-brand-focus rounded-2xl border border-slate-700/50">
          <div>
            <p className="text-sm font-bold text-white">Enable Session Reflections</p>
            <p className="text-xs text-slate-500">Clients will be prompted to reflect after each appointment.</p>
          </div>
          <button 
            onClick={() => setIsEnabled(!isEnabled)}
            className={cn(
              "w-12 h-6 rounded-full transition-all relative",
              isEnabled ? "bg-brand-accent" : "bg-slate-700"
            )}
          >
            <div className={cn(
              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
              isEnabled ? "right-1" : "left-1"
            )} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Questions</label>
          {questions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input 
                type="text"
                value={q}
                onChange={(e) => updateQuestion(i, e.target.value)}
                placeholder="Enter a reflection question..."
                className="flex-1 bg-brand-surface border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:ring-2 focus:ring-brand-accent focus:outline-none"
              />
              <button 
                onClick={() => removeQuestion(i)}
                className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button 
            onClick={addQuestion}
            className="w-full py-2 border border-dashed border-slate-700 rounded-xl text-slate-500 hover:text-brand-accent hover:border-brand-accent/50 transition-all text-xs font-bold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Question
          </button>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-brand-accent text-white py-3 rounded-xl font-bold hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2"
        >
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Save Template
        </button>
      </div>
    </Card>
  );
};

const ReflectionResponseViewer = ({ reflections }: { reflections: Reflection[] }) => {
  const sortedReflections = useMemo(() => {
    return [...reflections].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  }, [reflections]);

  if (reflections.length === 0) {
    return (
      <Card title="Reflection History" subtitle="No reflections submitted yet">
        <div className="text-center py-12 text-slate-600 italic text-sm">
          Client hasn't submitted any reflections yet.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Reflection History" subtitle="Review all past session reflections">
      <div className="space-y-6">
        {sortedReflections.map((r) => (
          <div key={r.id} className="bg-brand-focus border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Session Reflection</p>
                  <p className="text-xs text-slate-500">{format(parseISO(r.sessionDate), 'MMMM d, yyyy')}</p>
                </div>
              </div>
              <Badge variant={r.status === 'submitted' ? 'success' : 'default'}>
                {r.status === 'submitted' ? 'Submitted' : 'Draft'}
              </Badge>
            </div>
            <div className="space-y-4">
              {Object.entries(r.responses).map(([q, a]) => (
                <div key={q}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{q}</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{a || 'No response provided.'}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const ToolModal = ({ 
  isOpen, 
  onClose, 
  title, 
  children,
  type = 'basic'
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode;
  type?: 'basic' | 'advanced';
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#0b1121]/90 backdrop-blur-md"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-4xl bg-brand-surface border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-brand-surface/50">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
              <Badge variant={type === 'advanced' ? 'success' : 'default'}>
                {type === 'advanced' ? 'Advanced Tool' : 'Basic Tool'}
              </Badge>
              {type === 'advanced' && (
                <div className="flex items-center gap-1.5 text-xs text-brand-accent font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Secure Sync Active</span>
                </div>
              )}
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const GettingStartedView = ({ isToolsSite, setActiveTab }: { isToolsSite: boolean; setActiveTab: (tab: string) => void }) => (
  <div className="max-w-4xl mx-auto space-y-12 py-8">
    <header className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-accent/10 border border-brand-accent/20 text-brand-accent mb-4">
        <Zap className="w-10 h-10" />
      </div>
      <h1 className="text-4xl font-bold text-white tracking-tight">
        {isToolsSite ? "Welcome to the Tools Library" : "Welcome to Your Portal"}
      </h1>
      <p className="text-xl text-slate-400 max-w-2xl mx-auto">
        {isToolsSite 
          ? "A collection of cognitive tools designed to help you bypass executive dysfunction." 
          : "Your space to manage sessions, track progress, and access custom coaching tools."}
      </p>
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card title={isToolsSite ? "How to Use" : "Next Steps"} subtitle="Quick guide to get moving">
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold shrink-0">1</div>
            <div>
              <p className="font-bold text-white mb-1">Explore the Library</p>
              <p className="text-sm text-slate-400 leading-relaxed">Head to the Tools Library to see a growing list of interactive applications built for neurodivergent minds.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold shrink-0">2</div>
            <div>
              <p className="font-bold text-white mb-1">Launch in Focus Mode</p>
              <p className="text-sm text-slate-400 leading-relaxed">Click any tool to launch it in a distraction-free modal. Basic tools stay in your browser; Advanced tools sync with your account.</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('tools')}
            className="w-full mt-4 py-4 bg-brand-accent text-white rounded-2xl font-bold hover:bg-brand-secondary transition-all flex items-center justify-center gap-2"
          >
            Go to Library <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </Card>

      <Card title="Philosophy" subtitle="Why I build these tools">
        <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
          <p>
            As a neurodivergent professional, I know that standard "productivity apps" often add more friction than they solve. 
          </p>
          <p>
            The tools here are built with the **Neurodivergent First** principle—minimizing executive function tax, reducing demand avoidance, and providing clear visual anchors.
          </p>
          <div className="pt-4 flex flex-wrap gap-2">
            <Badge variant="success">Privacy-Focused</Badge>
            <Badge variant="success">Zero Friction</Badge>
            <Badge variant="success">Evidence-Based</Badge>
          </div>
        </div>
      </Card>
    </div>

    <div className="p-8 rounded-bento bg-brand-accent/5 border border-brand-accent/10 text-center">
      <Brain className="w-8 h-8 text-brand-accent mx-auto mb-4" />
      <h3 className="text-xl font-bold text-white mb-2 underline decoration-brand-accent/30 decoration-4 underline-offset-4">Have a Tool Idea?</h3>
      <p className="text-slate-400 text-sm mb-6 max-w-lg mx-auto leading-relaxed">
        I am constantly building new tools to solve specific client challenges. If you have a workflow you'd like to automate or a stuck point you'd like to deconstruct, let me know.
      </p>
      <a 
        href="mailto:coach@mrleeteaches.com?subject=Tool%20Idea"
        className="inline-flex items-center gap-2 text-brand-accent font-bold hover:text-brand-secondary transition-all"
      >
        Request a Feature <MessageSquare className="w-4 h-4" />
      </a>
    </div>
  </div>
);

const PrivacyVaultView = () => (
  <div className="max-w-4xl mx-auto space-y-12 py-8">
    <header className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 mb-4">
        <ShieldCheck className="w-10 h-10" />
      </div>
      <h1 className="text-4xl font-bold text-white tracking-tight">The Privacy Vault</h1>
      <p className="text-xl text-slate-400 max-w-2xl mx-auto">
        Your data security and ethical boundaries are the foundation of this platform.
      </p>
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="p-6 bg-brand-surface border border-slate-800 rounded-2xl">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Secure & Private by Design</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            I built this system to empower your brain, not to track it. This is why it requires you to be securely signed in so your data stays secure and private as well as allowing some of the functionality to work correctly by emailing you summaries or other data depending on the app.
          </p>
        </div>
        <div className="p-6 bg-brand-surface border border-slate-800 rounded-2xl">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 mb-4">
            <Wrench className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Basic vs Advanced Tools</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            "Basic" tools do not send any data to my servers. Everything stays in your browser session. "Advanced" tools require sign-in to securely store your data and enable AI features.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="p-6 bg-brand-surface border border-slate-800 rounded-2xl">
          <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Bank-Level Encryption</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            All data synced to the coaching portal is encrypted at rest using AES-256 and during transport using SSL/TLS.
          </p>
        </div>
        <div className="p-6 bg-brand-surface border border-slate-800 rounded-2xl">
          <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500 mb-4">
            <Trash2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Right to Erasure</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            You can delete your accounts or specific data points at any time. When you click delete, it is gone from the primary database instantly and permanently. Before you delete your account, be sure that you don't want any of the information because there is no way to retrieve it after deletion.
          </p>
        </div>
      </div>
    </div>
  </div>
);

const ReflectionEntryView = ({ 
  template, 
  appointment, 
  existingReflection,
  onSave 
}: { 
  template: ReflectionTemplate; 
  appointment: Appointment; 
  existingReflection: Reflection | null;
  onSave: (responses: Record<string, string>, status: 'draft' | 'submitted') => void 
}) => {
  const [responses, setResponses] = useState<Record<string, string>>(existingReflection?.responses || {});
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (status: 'draft' | 'submitted') => {
    setIsSaving(true);
    await onSave(responses, status);
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-white">Session Reflection</h2>
        <p className="text-slate-400 mt-1">Reflect on your session from {format(safeToDate(appointment.startTime), 'MMMM d, yyyy')}</p>
      </header>

      <Card title="Reflection Questions" subtitle="Take a moment to process your latest session">
        <div className="space-y-6">
          {template.questions.map((q) => (
            <div key={q}>
              <label className="block text-sm font-medium text-slate-300 mb-2">{q}</label>
              <textarea 
                value={responses[q] || ''}
                onChange={(e) => setResponses({ ...responses, [q]: e.target.value })}
                rows={4}
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent focus:outline-none"
                placeholder="Type your thoughts here..."
              />
            </div>
          ))}

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => handleSave('draft')}
              disabled={isSaving}
              className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
              Save Draft
            </button>
            <button 
              onClick={() => handleSave('submitted')}
              disabled={isSaving}
              className="flex-1 py-3 bg-brand-accent text-white rounded-xl font-bold hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Submit Reflection
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

function DashboardView({ 
  user,
  appointments, 
  clients, 
  documents, 
  messages, 
  profile, 
  setActiveTab, 
  onRequestSession, 
  onAction, 
  onSelectClient,
  onOpenCheckIn,
  habits = [],
  metrics = [],
  reflectionTemplate,
  reflections = [],
  notificationPermission,
  onRequestNotifications,
  onOpenReflection
}: any) {
  const nextAppointment = useMemo(() => {
    return appointments.find((a: any) => isAfter(safeToDate(a.startTime), new Date()) && a.status === 'scheduled');
  }, [appointments]);

  const unreadCount = useMemo(() => {
    return messages.filter((m: any) => m.receiverUid === profile?.uid && !m.isRead).length;
  }, [messages, profile]);

  const checkInProgress = useMemo(() => {
    if (profile?.role !== 'client') return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    const total = habits.length + metrics.length;
    if (total === 0) return null;
    
    const completedHabits = habits.filter((h: any) => h.history?.[today] !== undefined).length;
    const completedMetrics = metrics.filter((m: any) => m.history?.[today] !== undefined).length;
    const completed = completedHabits + completedMetrics;
    
    return {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
      isDone: completed === total
    };
  }, [habits, metrics, profile]);

  const reflectionDue = useMemo(() => {
    if (profile?.role !== 'client' || !reflectionTemplate?.isEnabled) return null;
    
    // Find completed appointments in the last 24 hours that don't have a reflection
    const oneDayAgo = addHours(new Date(), -24);
    const recentAppts = appointments.filter((a: any) => {
      const start = safeToDate(a.startTime);
      return isAfter(start, oneDayAgo) && isBefore(start, new Date()) && a.status === 'completed';
    });

    for (const appt of recentAppts) {
      const hasReflection = reflections.some((r: any) => r.appointmentId === appt.id && r.status === 'submitted');
      if (!hasReflection) {
        return appt;
      }
    }
    return null;
  }, [appointments, reflections, reflectionTemplate, profile]);

  const stats = [
    profile?.role === 'coach' 
      ? { label: 'Active Clients', value: clients.filter((c: any) => c.isActive !== false).length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', tab: 'clients' }
      : { label: 'Shared Documents', value: documents.length, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-400/10', tab: 'documents' },
    { label: 'Upcoming Sessions', value: appointments.filter((a: any) => a.status === 'scheduled' && isAfter(safeToDate(a.startTime), new Date())).length, icon: Calendar, color: 'text-brand-accent', bg: 'bg-brand-accent/10', tab: 'calendar' },
    { label: 'New Messages', value: unreadCount, icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-400/10', tab: 'messaging' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back, {profile?.displayName?.split(' ')[0] || 'User'}</h2>
          <p className="text-slate-400 mt-1">Here's what's happening with your coaching portal today.</p>
        </div>
        {profile?.role === 'client' && (
          <button 
            onClick={onRequestSession}
            className="flex items-center justify-center gap-2 bg-brand-accent text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-brand-focus"
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
            className="bg-brand-surface border border-slate-800/50 p-6 rounded-2xl hover:border-brand-accent/50 transition-all text-left group focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium group-hover:text-brand-accent transition-colors">{stat.label}</p>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

        {profile?.role === 'client' && (
          <ABCRoadmapView client={profile} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Check-in Card for Clients */}
        {profile?.role === 'client' && (
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onOpenCheckIn}
              className={cn(
                "w-full p-6 rounded-[2rem] shadow-xl text-left relative overflow-hidden group transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-brand-accent",
                checkInProgress?.isDone 
                  ? "bg-brand-surface border border-brand-accent/30 shadow-brand-accent/5" 
                  : "bg-gradient-to-br from-brand-focus to-brand-primary shadow-brand-primary/20"
              )}
            >
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-700">
                <ClipboardCheck className="w-24 h-24 text-white" />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                    checkInProgress?.isDone ? "bg-brand-accent/20 text-brand-accent" : "bg-white/20 text-white"
                  )}>
                    {checkInProgress?.isDone ? 'Check-in Complete' : 'Daily Action Required'}
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                  {checkInProgress?.isDone ? "You're all set!" : "Daily Check-in"}
                </h3>
                <div className="flex items-center gap-4 mt-4">
                  <div className="text-2xl font-black text-white">
                    {checkInProgress?.completed || 0}<span className="text-sm opacity-50 font-medium ml-1">/ {checkInProgress?.total || 0}</span>
                  </div>
                  <div className="flex-1 h-1.5 bg-black/20 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${checkInProgress?.percent || 0}%` }}
                      className="h-full bg-brand-accent"
                    />
                  </div>
                </div>
              </div>
            </motion.button>

            {reflectionTemplate?.isEnabled && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => reflectionDue && onOpenReflection(reflectionDue)}
                className={cn(
                  "w-full p-6 rounded-[2rem] shadow-xl text-left relative overflow-hidden group transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-brand-accent",
                  reflectionDue 
                    ? "bg-gradient-to-br from-brand-accent to-brand-secondary shadow-brand-accent/20" 
                    : "bg-brand-surface border border-slate-800 shadow-xl"
                )}
              >
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <Brain className="w-24 h-24 text-white" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                      reflectionDue ? "bg-white/20 text-white" : "bg-slate-800 text-slate-500"
                    )}>
                      {reflectionDue ? 'Reflection Due' : 'Up to Date'}
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                    Session Reflection
                  </h3>
                  <p className={cn(
                    "text-sm opacity-90",
                    reflectionDue ? "text-white/80" : "text-slate-500"
                  )}>
                    {reflectionDue 
                      ? `Reflect on your session from ${format(safeToDate(reflectionDue.startTime), 'MMM d')}`
                      : "No reflections due right now. Great job processing your sessions!"}
                  </p>
                  {reflectionDue && (
                    <div className="mt-4 inline-flex items-center gap-2 text-white font-bold text-sm">
                      Reflect Now <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </motion.button>
            )}
          </div>
        )}

        {/* Next Appointment */}
        <Card 
          title="Next Appointment" 
          subtitle="Your upcoming session details"
          action={
            <button 
              onClick={() => setActiveTab('calendar')}
              className="text-brand-accent text-sm font-medium hover:underline flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-brand-accent rounded"
            >
              View Calendar <ChevronRight className="w-4 h-4" />
            </button>
          }
        >
          {nextAppointment ? (
            <div className="bg-brand-focus rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-xl font-bold text-white tracking-tight">{nextAppointment.title}</h4>
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
                    className="text-xs text-brand-accent hover:text-brand-secondary font-medium flex items-center gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent rounded"
                  >
                    <Calendar className="w-3 h-3" /> Add to Calendar
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="flex items-center gap-3 text-slate-300">
                  <Calendar className="w-5 h-5 text-brand-accent" />
                  <span className="text-sm">{format(safeToDate(nextAppointment.startTime), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <Clock className="w-5 h-5 text-brand-accent" />
                  <span className="text-sm">{format(safeToDate(nextAppointment.startTime), 'h:mm a')}</span>
                </div>
              </div>
              {nextAppointment.meetLink && (
                <a 
                  href={nextAppointment.meetLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-6 w-full flex items-center justify-center gap-2 bg-brand-accent/10 text-brand-accent border border-brand-accent/20 py-3 rounded-xl hover:bg-brand-accent/20 transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
              className="text-brand-accent text-sm font-medium hover:underline flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-brand-accent rounded"
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
                  className="w-full flex items-center justify-between p-3 bg-brand-surface rounded-xl border border-slate-700/30 hover:bg-brand-focus transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs">
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
                <div key={doc.id} className="flex items-center justify-between p-3 bg-brand-surface rounded-xl border border-slate-700/30 hover:bg-brand-focus transition-all group">
                  <a 
                    href={doc.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-3 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand-accent rounded"
                  >
                    <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-brand-accent transition-colors">{doc.name}</p>
                      <p className="text-xs text-slate-500">{format(safeToDate(doc.createdAt), 'MMM d')}</p>
                    </div>
                  </a>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-white shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-accent rounded">
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
      {role === 'coach' && !isCalendarId(appt.clientEmail) && (
        <div className="flex gap-3 mt-4 pl-20">
          <button 
            onClick={() => onAction(appt, 'coaching-tools')}
            className="flex items-center gap-2 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-wider"
          >
            <Wrench className="w-3 h-3" /> Coaching Tools
          </button>
        </div>
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number *</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                  className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
                  placeholder="25"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Preferred Name</label>
                <input 
                  type="text" 
                  value={formData.preferredName}
                  onChange={e => setFormData({...formData, preferredName: e.target.value})}
                  className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                <div className="p-4 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl">
                  <p className="text-brand-accent text-sm font-medium">
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
                      className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone *</label>
                    <input 
                      type="tel" 
                      value={formData.parentPhone}
                      onChange={e => setFormData({...formData, parentPhone: e.target.value})}
                      className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email *</label>
                  <input 
                    type="email" 
                    value={formData.parentEmail}
                    onChange={e => setFormData({...formData, parentEmail: e.target.value})}
                    className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                        className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone</label>
                      <input 
                        type="tel" 
                        value={formData.secondaryParentPhone}
                        onChange={e => setFormData({...formData, secondaryParentPhone: e.target.value})}
                        className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email</label>
                    <input 
                      type="email" 
                      value={formData.secondaryParentEmail}
                      onChange={e => setFormData({...formData, secondaryParentEmail: e.target.value})}
                      className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contact Phone Number *</label>
              <input 
                type="tel" 
                value={formData.emergencyContactPhone}
                onChange={e => setFormData({...formData, emergencyContactPhone: e.target.value})}
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent min-h-[100px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">What feels most challenging at the moment? *</label>
              <div className="grid grid-cols-1 gap-2">
                {challengesOptions.map(option => (
                  <label key={option} className="flex items-center gap-3 p-3 bg-brand-surface border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                    <input 
                      type="checkbox"
                      checked={formData.challenges.includes(option)}
                      onChange={() => handleChallengeToggle(option)}
                      className="w-4 h-4 rounded border-slate-700 text-brand-accent focus:ring-brand-accent bg-slate-900"
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
                    className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent"
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent min-h-[100px]"
                placeholder="Please share if you feel comfortable doing so."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Are you currently seeing a therapist or counselor? *</label>
              <div className="space-y-2">
                {["Yes", "No", "Looking for one or looking for a new one"].map(option => (
                  <label key={option} className="flex items-center gap-3 p-3 bg-brand-surface border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                    <input 
                      type="radio"
                      name="therapist"
                      checked={formData.seeingTherapist === option}
                      onChange={() => setFormData({...formData, seeingTherapist: option})}
                      className="w-4 h-4 border-slate-700 text-brand-accent focus:ring-brand-accent bg-slate-900"
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Preferred session frequency: *</label>
              <div className="grid grid-cols-2 gap-2">
                {["Weekly", "Biweekly", "Monthly", "As needed basis"].map(option => (
                  <label key={option} className="flex items-center gap-3 p-3 bg-brand-surface border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                    <input 
                      type="radio"
                      name="frequency"
                      checked={formData.frequency === option}
                      onChange={() => setFormData({...formData, frequency: option})}
                      className="w-4 h-4 border-slate-700 text-brand-accent focus:ring-brand-accent bg-slate-900"
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
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Is there anything else that you feel I should be aware of?</label>
              <textarea 
                value={formData.anythingElse}
                onChange={e => setFormData({...formData, anythingElse: e.target.value})}
                className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-accent min-h-[80px]"
              />
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white">Legal Agreements</h3>
            <div className="p-6 bg-brand-surface border border-slate-800 rounded-2xl space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Please Note: Coaching is not therapy and is not a substitute for mental health treatment. If concerns arise that are outside the scope of coaching, referrals may be recommended.
              </p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 bg-brand-focus border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                  <input 
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={e => setFormData({...formData, agreedToTerms: e.target.checked})}
                    className="mt-1 w-5 h-5 rounded border-slate-700 text-brand-accent focus:ring-brand-accent bg-slate-900"
                  />
                  <span className="text-sm text-slate-300">
                    I have read and agree to the <a href="https://mrleeteaches.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline">Privacy Policy</a> and <a href="https://mrleeteaches.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline">Terms & Conditions</a>. *
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
    <div className="min-h-screen bg-brand-focus flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-brand-surface border border-slate-800/50 rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-8 md:p-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Welcome to Coaching</h2>
              <p className="text-slate-400">Please complete your onboarding intake form.</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-brand-accent/10 flex items-center justify-center text-brand-accent border border-brand-accent/20">
              <FileCheck className="w-8 h-8" />
            </div>
          </div>

          <div className="flex gap-2 mb-12">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div 
                key={i} 
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-brand-accent' : 'bg-slate-800'}`}
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
                className="flex items-center gap-2 px-6 py-4 bg-brand-focus text-slate-300 rounded-2xl font-bold hover:bg-slate-800 transition-all border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
            )}
            {step < 6 ? (
              <button 
                disabled={!isStepValid()}
                onClick={() => setStep(step + 1)}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-brand-accent text-white rounded-2xl font-bold hover:bg-brand-secondary shadow-lg shadow-brand-accent/20 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                Next <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                disabled={!isStepValid() || loading}
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-brand-accent text-white rounded-2xl font-bold hover:bg-brand-secondary shadow-lg shadow-brand-accent/20 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
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

function ClientsView({ 
  clients, 
  appointments, 
  documents, 
  role, 
  selectedClient, 
  setSelectedClient,
  setSelectedCoachingClient,
  setActiveTab
}: any) {
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
          className="flex items-center gap-2 bg-brand-accent text-white px-4 py-2 rounded-xl hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
            className="w-full bg-brand-surface border border-slate-800/50 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent shadow-xl"
          />
        </div>
        <div className="flex bg-brand-surface border border-slate-800/50 rounded-2xl p-1">
          {(['active', 'inactive', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                filter === f ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/20' : 'text-slate-400 hover:text-white'
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
              className="bg-brand-surface border border-slate-800/50 p-6 rounded-2xl group hover:border-brand-accent/50 transition-all shadow-xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-brand-accent/10 flex items-center justify-center text-brand-accent font-bold text-xl border border-brand-accent/20">
                  {client.displayName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-white truncate tracking-tight">{client.displayName}</h4>
                  <p className="text-sm text-slate-500 truncate">{client.email}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                    client.isActive !== false ? 'bg-brand-accent/10 text-brand-accent' : 'bg-slate-500/10 text-slate-500'
                  }`}>
                    {client.isActive !== false ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleClientStatus(client);
                    }}
                    aria-label={`Toggle ${client.displayName} status`}
                    className={`w-10 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                      client.isActive !== false ? 'bg-brand-accent' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                      client.isActive !== false ? 'left-5' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-brand-focus p-3 rounded-xl border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Sessions</p>
                  <p className="text-lg font-bold text-white">{clientAppts.length}</p>
                </div>
                <div className="bg-brand-focus p-3 rounded-xl border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Joined</p>
                  <p className="text-sm font-bold text-white">{client.createdAt ? format(safeToDate(client.createdAt), 'MMM yyyy') : 'N/A'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedClient(client)}
                  className="flex-1 py-3 bg-brand-focus text-slate-300 rounded-xl font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                >
                  View Profile <ChevronRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditData({ ...client });
                    setIsEditing(true);
                  }}
                  className="p-3 bg-brand-accent/10 text-brand-accent rounded-xl hover:bg-brand-accent/20 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      setSelectedCoachingClient(selectedClient);
                      setActiveTab('coaching-dashboard');
                      setSelectedClient(null);
                    }}
                    className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors flex items-center gap-2 font-bold text-sm shadow-lg shadow-emerald-600/20"
                  >
                    <Wrench className="w-4 h-4" /> Coaching Tools
                  </button>
                  <button 
                    onClick={() => {
                      setEditData({ ...selectedClient });
                      setIsEditing(true);
                      setSelectedClient(null);
                    }}
                    className="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2 font-bold text-sm"
                  >
                    <Edit2 className="w-4 h-4" /> Edit Profile
                  </button>
                </div>
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
    icon: Zap,
    description: "The Energy Balance Dashboard is a low-friction tool designed to help you visualize your daily capacity and prevent burnout using the principles of Energy Accounting. Simply log your morning readiness using the quick slider, then tap to rate your daily activities as either energy 'drains' or restorative 'deposits'. The dashboard automatically graphs your trends so you can easily see what depletes your battery, proactively plan your recovery time, and export a one-click summary for our coaching sessions.",
    type: 'internal',
    category: 'advanced'
  },
  {
    name: "Task Deconstructor",
    icon: Layers,
    description: "The Task Deconstructor is a low-friction tool designed to help you bypass executive dysfunction and overcome the paralysis of getting started. Simply type in an overwhelming task and click 'Deconstruct For Me' to let the app automatically break your goal into microscopic, highly specific actions. Once you begin, the tool activates Tunnel Vision by hiding the overarching list and displaying only one single step on the screen at a time. Just focus on the action in front of you, click the 'Done' button when finished, and seamlessly build momentum until the entire project is cleared.",
    link: "https://script.google.com/macros/s/AKfycbwEusYxAKmAgSl3vs-LDPOS90HJ6wJygggfPDoi6eK4iyqKrZgdEpBAU5Y3NAQPWu8xtw/exec",
    category: 'basic'
  },
  {
    name: "Time-Blindness Visualizer",
    icon: Hourglass,
    description: `The Time-Blindness Visualizer is a sensory-friendly pacing tool designed to replace anxiety-inducing numerical countdowns with a low-demand visual representation of time. Simply select or type in your desired duration, and the screen will display five green energy blocks that gently drain in halves as time passes, allowing you to gauge your remaining "time volume" at a quick glance without doing mental math. When your session is complete, a soft, harmonic singing bowl chime provides a gentle cue to transition, allowing you to easily reset for your next focused chunk of work. This tool is built specifically to protect your working memory and help you pace your energy without triggering demand avoidance.`,
    link: "https://script.google.com/macros/s/AKfycbypm9TIR_t_CFcF_3CKUOD8hWsGAb_4TH0T9X8mwGvgXnxsU1C9hdUqC6HXxhwrTfYv/exec",
    category: 'basic'
  },
  {
    name: "Frictionless Brain Dump",
    icon: BrainCircuit,
    description: `The Frictionless Brain Dump is designed to help you instantly externalize your working memory without the executive function tax of organizing your thoughts on the spot. Whether you have a sudden idea, a looming task, or simply need to process an emotion, just type or dictate your raw thoughts into the single text box and hit save. Every evening at 5:00 PM, the system automatically reviews your raw notes, sorts them into Tasks, Ideas, and Emotional Check-ins, and delivers a clean, organized digest straight to your inbox.`,
    type: 'internal',
    category: 'advanced'
  },
  {
    name: "Dear Man Batting Cage",
    icon: MessageSquare,
    description: `The DEAR MAN Batting Cage is a safe, zero-pressure environment to practice the Dialectical Behavior Therapy (DBT) framework for effective communication. To build your skills, start by logging past or upcoming interpersonal challenges in the Tracker tab to isolate the facts from your emotional responses. When you are ready to test a scenario, switch to the Practice tab to roleplay the interaction with an AI partner who adapts to your approach and provides a real-time DEAR MAN scorecard. Over time, the Analysis dashboard will review your recent "at-bats" to identify patterns in your communication, highlighting your strengths and gently pointing out areas for improvement.`,
    type: 'internal',
    category: 'advanced'
  },
  {
    name: "ABC Cognitive Reframing",
    icon: Activity,
    description: "The ABC's of Thoughts, Feelings, & Actions tool is a cognitive reframing system designed to help you externalize and examine intense internal experiences. Simply log the 'Activating Event' to ground yourself in the facts of what happened, then document the 'Beliefs' or thoughts the situation triggered. After noting the emotional and behavioral 'Consequences', you can work with the system to develop a 'Reframe'—a more balanced or helpful perspective. This tool helps you build awareness of your cognitive patterns and empowers you to shift your outcome over time.",
    type: 'internal',
    category: 'advanced'
  }
];

function ToolsLibraryView({ user, setActiveTab, onOpenABC, onOpenBrainDump, onOpenTool, onOpenAuth }: { user: User | null; setActiveTab?: (tab: string) => void; onOpenABC?: () => void; onOpenBrainDump?: () => void; onOpenTool?: (name: string, type: 'basic' | 'advanced', component: React.ReactNode) => void; onOpenAuth?: () => void }) {
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
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(index);
              }}
              className="ml-1 text-brand-accent hover:text-brand-secondary font-medium focus:outline-none focus:ring-2 focus:ring-brand-accent rounded px-1"
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
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(index);
          }}
          className="ml-1 text-brand-accent hover:text-brand-secondary font-medium focus:outline-none focus:ring-2 focus:ring-brand-accent rounded px-1"
        >
          more
        </button>
      </>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white tracking-tight">Tools Library</h2>
        <p className="text-slate-400 mt-1">Access useful coaching applications and exercises.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TOOLS.map((tool: any, index) => (
          <div key={index} className="bg-brand-surface border border-slate-800/50 p-6 rounded-2xl group hover:border-brand-accent/50 transition-all flex flex-col shadow-xl relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                tool.category === 'advanced' 
                  ? "bg-brand-accent/10 border-brand-accent/30 text-brand-accent" 
                  : "bg-slate-800 border-slate-700 text-slate-400"
              )}>
                {tool.category === 'advanced' ? 'Advanced Tool' : 'Basic Tool'}
              </span>
            </div>

            <div className="w-12 h-12 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent mb-4 border border-brand-accent/20">
              <tool.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{tool.name}</h3>
            <div className="text-sm text-slate-400 mb-6 flex-1 leading-relaxed">
              {getTruncatedText(tool.description, index)}
            </div>
            
            {tool.type === 'internal' ? (
              <button 
                onClick={() => {
                  if (tool.name === 'Frictionless Brain Dump' || tool.name === 'ABC Cognitive Reframing' || tool.name === 'Energy Balance Dashboard' || tool.name === 'Dear Man Batting Cage') {
                    if (!user) {
                      onOpenAuth?.();
                    } else {
                      if (tool.name === 'Frictionless Brain Dump') onOpenBrainDump?.();
                      if (tool.name === 'ABC Cognitive Reframing') {
                        if (onOpenABC) onOpenABC();
                        else if (onOpenTool) onOpenTool('ABC Cognitive Reframing', 'basic', <ABCWorksheet isPrivate={true} onSave={() => {}} />);
                      }
                      if (tool.name === 'Energy Balance Dashboard') {
                        onOpenTool?.('Energy Balance Dashboard', 'advanced', <EnergyBalanceDashboard user={user} />);
                      }
                      if (tool.name === 'Dear Man Batting Cage') {
                        onOpenTool?.('Dear Man Batting Cage', 'advanced', <DearManMastery user={user} />);
                      }
                    }
                  } else if (tool.tab) {
                    setActiveTab?.(tool.tab);
                  } else if (tool.action) {
                    tool.action();
                  }
                }}
                className="flex items-center justify-center gap-2 w-full py-3 bg-brand-accent text-white rounded-xl font-bold hover:bg-brand-secondary transition-all group-hover:shadow-lg group-hover:shadow-brand-accent/10 border border-brand-accent/20 focus:outline-none focus:ring-2 focus:ring-brand-accent text-sm"
              >
                {(tool.name === 'Frictionless Brain Dump' || tool.name === 'ABC Cognitive Reframing' || tool.description.includes('Sign in')) && !user ? 'Please Sign in to Use' : 'Open Tool'} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <a 
                href={tool.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-brand-focus text-white rounded-xl font-bold hover:bg-slate-800 transition-all group-hover:shadow-lg group-hover:shadow-brand-accent/10 border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                Open Tool <ExternalLink className="w-4 h-4" />
              </a>
            )}
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
  const [activeLibraryTab, setActiveLibraryTab] = useState<'drive' | 'treatment'>('drive');

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
          <p className="text-slate-400 mt-1">Browse and share resources with your clients.</p>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveLibraryTab('drive')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeLibraryTab === 'drive' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            Google Drive
          </button>
          <button 
            onClick={() => setActiveLibraryTab('treatment')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeLibraryTab === 'treatment' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            Treatment Library
          </button>
        </div>
      </header>

      {activeLibraryTab === 'drive' ? (
        <>
          <div className="flex items-center justify-end gap-4">
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
        </>
      ) : (
        <TreatmentLibraryView />
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
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

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

  const handleDelete = async (docId: string, url: string, name: string) => {
    setDeleteConfirm({
      id: docId,
      name,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'documents', docId));
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Delete Document?</h3>
              <p className="text-slate-400 mb-8">
                Are you sure you want to delete "<span className="text-white font-semibold">{deleteConfirm.name}</span>"? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await deleteConfirm.onConfirm();
                      setDeleteConfirm(null);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `documents/${deleteConfirm.id}`);
                    }
                  }}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-500 shadow-lg shadow-rose-600/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
                    onClick={() => handleDelete(doc.id, doc.url, doc.name)}
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
                <div className="w-20 h-20 rounded-3xl bg-brand-accent/10 flex items-center justify-center text-brand-accent text-3xl font-bold overflow-hidden border border-brand-accent/20">
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
                    className="bg-brand-focus text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
                    className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
                  />
                  <p className="text-xs text-slate-500 mt-2">Available variables: {'{title}'}, {'{time}'}, {'{date}'}</p>
                </div>
                <button 
                  onClick={handleUpdateTemplate}
                  disabled={saving}
                  className="bg-brand-accent text-white px-6 py-3 rounded-xl font-medium hover:bg-brand-secondary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
                      className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
                        className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-400 mb-2">Reminder End (EST)</label>
                      <input 
                        type="number" 
                        min="0" max="23"
                        value={syncSettings.reminderEndHour}
                        onChange={(e) => setSyncSettings({...syncSettings, reminderEndHour: parseInt(e.target.value)})}
                        className="w-full bg-brand-focus border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
                    className="w-5 h-5 rounded bg-brand-focus border-slate-700 text-brand-accent focus:ring-brand-accent"
                  />
                  <label htmlFor="catchAll" className="text-sm text-slate-300">
                    Send evening reminders at the last sync of the day ({syncSettings.reminderEndHour}:00 EST)
                  </label>
                </div>
                <button 
                  onClick={handleUpdateSyncSettings}
                  disabled={saving}
                  className="bg-brand-accent text-white px-6 py-3 rounded-xl font-medium hover:bg-brand-secondary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                >
                  {saving ? 'Saving...' : 'Save Sync Settings'}
                </button>
              </div>
            </Card>
          )}

          <Card title="Notifications" subtitle="Manage how you receive updates">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-brand-surface rounded-2xl border border-slate-700/30">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    notificationPermission === 'granted' ? "bg-brand-accent/10 text-brand-accent" : 
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
                      notificationPermission === 'default' && "group-hover:text-brand-accent underline decoration-brand-accent/30 underline-offset-4"
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
                    className="bg-brand-accent text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-secondary transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
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
                  <div className="text-xs text-brand-accent font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Active
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-brand-focus rounded-2xl border border-dashed border-slate-700">
                <p className="text-xs text-slate-500 leading-relaxed">
                  When enabled, you will receive real-time notifications for:
                </p>
                <ul className="mt-2 space-y-1">
                  <li className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-brand-accent" /> Appointment Reminders
                  </li>
                  <li className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-brand-accent" /> Shared Documents
                  </li>
                  <li className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-brand-accent" /> Message Notifications
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
