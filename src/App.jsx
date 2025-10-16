import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc,
  query, where, onSnapshot, runTransaction, 
  serverTimestamp, collectionGroup
} from 'firebase/firestore';


// --- CONFIGURATION AND SETUP (Replace with your LIVE config) ---
const REAL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDeqnIxPxG1uAtpmKjOq9XN26HGh_mLVbk",
  authDomain: "hostel-issues-tracker.firebaseapp.com",
  projectId: "hostel-issues-tracker",
  storageBucket: "hostel-issues-tracker.firebasestorage.app",
  messagingSenderId: "1074192461219",
  appId: "1:1074192461219:web:ae77184345d91bcfb57e16",
  measurementId: "G-1TPZEFNMN0"
};

const appId = REAL_FIREBASE_CONFIG.projectId; 
const firebaseConfig = REAL_FIREBASE_CONFIG; 

// Pre-defined issue categories
const ISSUE_CATEGORIES = [
  'Cleaning', 'Water Filter', 'Washroom Repair', 'Lift Issue',
  'WiFi/Network', 'Power Supply', 'Pest Control', 'Other'
];

// Available blocks and floors 
const BLOCKS = ['A', 'B', 'C', 'D'];
const FLOORS = [1, 2, 3, 4];

// Utility function to get the public collection path
const getPublicCollectionRef = (db, collectionName) => 
  collection(db, `/artifacts/${appId}/public/data/${collectionName}`);

// Utility function to get the private user profile path
const getUserProfileDoc = (db, userId) =>
  doc(db, `/artifacts/${appId}/users/${userId}/profiles/userProfile`);

// Utility function to get the issues collection path
const getIssuesCollectionRef = (db) => 
  getPublicCollectionRef(db, 'issue-tracker-issues');


// =================================================================
// -------------------- CORE COMPONENTS -----------------
// =================================================================

// --- 1. Issue Card Component (Used by Caretaker Dashboard) ---
const IssueCard = ({ issue, updateStatus }) => {
  const statusClasses = {
    New: 'bg-red-50 text-red-700 border-red-400',
    'In Progress': 'bg-yellow-50 text-yellow-700 border-yellow-400',
    Resolved: 'bg-green-50 text-green-700 border-green-400',
  };

  const urgencyClass = issue.isUrgent ? 'bg-pink-600 text-white font-bold shadow-md' : 'bg-gray-100 text-gray-700';
  const createdAt = issue.createdAt?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl border-t-4 border-indigo-400/50 flex flex-col h-full transform hover:scale-[1.01] transition duration-300">
      <div className="flex justify-between items-center mb-3 border-b pb-2">
        <span className={`px-3 py-1 text-xs rounded-full ${urgencyClass} shadow-sm`}>
          {issue.isUrgent ? '⚡ URGENT PRIORITY' : 'Standard'}
        </span>
        <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusClasses[issue.status]}`}>
          {issue.status}
        </span>
      </div>

      <div className='flex items-center space-x-3 mb-3'>
        <div className='flex-shrink-0 text-xl font-bold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full shadow-inner'>
            {issue.block}-{issue.floor}F
        </div>
        <h3 className="text-lg font-extrabold text-gray-800 flex-grow">
          {issue.category} Issue
        </h3>
      </div>
      
      <p className="text-sm text-gray-600 mb-4 flex-grow italic bg-gray-50 p-3 rounded-lg border line-clamp-3">
        {issue.description}
      </p>

      <div className="text-xs text-gray-500 mb-4 pt-2 border-t">
        Reported on: <span className='font-semibold'>{createdAt}</span>
      </div>

      <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
        <span className="font-semibold text-gray-700">
          Rooms Tagged:
        </span>
        <span className="flex flex-wrap justify-end gap-1">
          {issue.reporters.slice(0, 4).map((r, index) => (
            <span key={index} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-xs font-medium border border-indigo-200">
              {r.room}
            </span>
          ))}
          {issue.reporters.length > 4 && (
            <span className="text-xs text-gray-500 py-0.5 ml-1">+{issue.reporters.length - 4}</span>
          )}
        </span>
      </div>

      <div className="mt-auto flex space-x-2 pt-3 border-t">
        {issue.status !== 'Resolved' && (
          <button
            onClick={() => updateStatus(issue.id, 'In Progress')}
            className="flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-yellow-600 hover:bg-yellow-700 transition duration-150 shadow-md"
            disabled={issue.status === 'In Progress'}
          >
            {issue.status === 'In Progress' ? 'In Progress' : 'Start Work'}
          </button>
        )}
        {(issue.status === 'New' || issue.status === 'In Progress') && (
          <button
            onClick={() => updateStatus(issue.id, 'Resolved')}
            className="flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 transition duration-150 shadow-md"
          >
            Mark Resolved
          </button>
        )}
      </div>
    </div>
  );
};


// --- 2. Caretaker Dashboard Component ---
const CaretakerDashboard = ({ db, appId, filterBlock, filterUrgent }) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const issueTitle = useMemo(() => {
    if (filterUrgent) return "All Urgent Tasks";
    if (filterBlock) return `Active Issues in Block ${filterBlock}`;
    return "Caretaker Dashboard (All Active Issues)";
  }, [filterUrgent, filterBlock]);

  const updateStatus = useCallback(async (issueId, newStatus) => {
    try {
      const issueRef = doc(getIssuesCollectionRef(db), issueId);
      await updateDoc(issueRef, { status: newStatus });
    } catch (e) {
      console.error("Error updating issue status:", e);
      // Simple visual feedback for the user
      alert("Failed to update status. Check console."); 
    }
  }, [db]);

  useEffect(() => {
    if (!db) return;

    let issuesQuery = query(
      getIssuesCollectionRef(db),
      where('status', 'in', ['New', 'In Progress']) 
    );

    if (filterBlock) {
      issuesQuery = query(issuesQuery, where('block', '==', filterBlock));
    }
    
    if (filterUrgent) {
      issuesQuery = query(issuesQuery, where('isUrgent', '==', true));
    }

    const unsubscribe = onSnapshot(issuesQuery, 
      (snapshot) => {
        const issuesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        issuesList.sort((a, b) => {
          // Sort by urgent first, then by creation date
          if (a.isUrgent !== b.isUrgent) {
            return a.isUrgent ? -1 : 1;
          }
          return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
        });
        setIssues(issuesList);
        setLoading(false);
      },
      (e) => {
        console.error("Error fetching issues:", e);
        setError("Error loading issues. Check network/rules.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, filterBlock, filterUrgent]);

  if (loading) return <LoadingSpinner message="Loading issues..." />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-8">
      <h2 className={`text-4xl font-extrabold ${filterUrgent ? 'text-pink-700' : 'text-gray-900'} border-b-4 ${filterUrgent ? 'border-pink-300' : 'border-indigo-200'} pb-3`}>
        {issueTitle} 
        <span className="text-indigo-600 ml-3 bg-indigo-100 px-3 py-1 rounded-full text-2xl">({issues.length})</span>
      </h2>
      
      {issues.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl shadow-inner border border-dashed border-green-300">
          <p className="text-2xl text-green-600 font-bold">
            🎉 All Clear! 
          </p>
          <p className="text-lg text-gray-500 mt-2">
            No active issues found {filterBlock ? `for Block ${filterBlock}` : 'across all blocks'}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {issues.map(issue => (
            <IssueCard key={issue.id} issue={issue} updateStatus={updateStatus} />
          ))}
        </div>
      )}
    </div>
  );
};


// --- 3. Student Reporter Component ---
const StudentReporter = ({ db, userProfile, appId }) => {
  const [floor, setFloor] = useState(FLOORS[0]);
  const [category, setCategory] = useState(ISSUE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const block = userProfile.block;
  const roomNumber = userProfile.roomNumber;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);

    if (!block || !roomNumber) {
        setMessage('Error: Missing block or room number in profile. Please contact the administrator.');
        setIsLoading(false);
        return;
    }
    
    // Create the consolidation key based on block, floor, and category
    const consolidationKey = `${block}_${floor}_${category.replace(/\s/g, '_').toUpperCase()}`;
    const issueRef = getIssuesCollectionRef(db);
    
    try {
      await runTransaction(db, async (transaction) => {
        // Query for existing active issues with the same key
        const existingQuery = query(
          issueRef, 
          where('consolidationKey', '==', consolidationKey),
          where('status', 'in', ['New', 'In Progress']) 
        );
        
        const existingSnapshot = await transaction.get(existingQuery);
        const reporterData = { room: roomNumber, userId: userProfile.userId };

        if (!existingSnapshot.empty) {
          // --- CONSOLIDATION LOGIC: Found existing task ---
          const existingDoc = existingSnapshot.docs[0];
          const existingIssueRef = doc(issueRef, existingDoc.id);
          const existingReporters = existingDoc.data().reporters || [];
          const alreadyReported = existingReporters.some(r => r.room === roomNumber);

          if (!alreadyReported) {
            transaction.update(existingIssueRef, {
              reporters: [...existingReporters, reporterData],
            });
            setMessage(`✅ Successfully tagged existing issue. Your report is linked to ${existingDoc.data().reporters.length + 1} total rooms.`);
          } else {
            setMessage('⚠️ This exact issue has already been reported and tagged by your room. Thank you!');
          }

        } else {
          // --- NEW ISSUE LOGIC: No existing active task found ---
          const newIssue = {
            block,
            floor,
            category,
            description,
            isUrgent,
            status: 'New',
            consolidationKey,
            createdAt: serverTimestamp(),
            reporters: [reporterData],
          };
          
          const newDocRef = doc(issueRef);
          transaction.set(newDocRef, newIssue);
          setMessage('✅ New issue created successfully! The caretaker has been notified.');
        }
      });
      
      // Clear form after successful submission
      setDescription('');
      setIsUrgent(false);

    } catch (e) {
      console.error("Submission error:", e);
      setMessage(`❌ Failed to submit issue: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-2xl border-t-4 border-indigo-600/70">
      <h2 className="text-3xl font-extrabold text-indigo-700 mb-6 border-b pb-3">Report a New Issue</h2>
      
      <p className="mb-6 text-gray-700 bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-inner font-medium">
        Reporting from **Room {roomNumber}** in **Block {block}**. We consolidate identical reports automatically.
      </p>

      {message && (
        <div className={`p-4 mb-6 rounded-xl text-sm font-semibold ${message.startsWith('✅') ? 'bg-green-100 text-green-800 border border-green-400' : message.startsWith('⚠️') ? 'bg-yellow-100 text-yellow-800 border border-yellow-400' : 'bg-red-100 text-red-800 border border-red-400'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Floor and Category Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Select Floor</label>
            <select
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              required
              className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
            >
              {FLOORS.map(f => (
                <option key={f} value={f}>Floor {f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Main Issue Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
            >
              {ISSUE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Urgency Toggle */}
        <div className="flex items-center justify-between p-4 bg-pink-50 rounded-xl border border-pink-200 shadow-md">
          <label htmlFor="urgency-toggle" className="text-base font-bold text-pink-700 flex items-center space-x-2">
            <span>⚡ Immediate Urgency?</span>
            <span className="text-xs font-normal text-gray-500">(Major incident, power cut, serious leak)</span>
          </label>
          <input
            id="urgency-toggle"
            type="checkbox"
            checked={isUrgent}
            onChange={(e) => setIsUrgent(e.target.checked)}
            className="w-6 h-6 text-pink-600 border-pink-300 rounded-md focus:ring-pink-500 cursor-pointer shadow-sm"
          />
        </div>
        
        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-1">Detailed Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="5"
            required
            className="w-full p-4 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 resize-none transition duration-150"
            placeholder="Please describe the issue clearly and where exactly it is located."
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 px-4 rounded-xl shadow-lg text-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition duration-200 disabled:opacity-50 flex items-center justify-center space-x-2 transform hover:scale-[1.005]"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="h-5 w-5 border-2" />
              <span>Submitting Report...</span>
            </>
          ) : (
            <span>Post Issue</span>
          )}
        </button>
      </form>
    </div>
  );
};


// --- 4. Contacts Page Component ---
const ContactsPage = ({ db, appId }) => {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!db) return;

        const contactsRef = doc(getPublicCollectionRef(db, 'issue-tracker-contacts'), 'default_list');

        const unsubscribe = onSnapshot(contactsRef, 
            (docSnap) => {
                if (docSnap.exists() && docSnap.data().list) {
                    setContacts(docSnap.data().list);
                } else {
                    setContacts([]);
                }
                setLoading(false);
            },
            (e) => {
                console.error("Error fetching contacts:", e);
                setError("Failed to load contacts. Check Firestore data setup.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db]);

    if (loading) return <LoadingSpinner message="Loading contacts..." />;
    if (error) return <ErrorMessage message={error} />;

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-8 border-b-4 border-indigo-200 pb-3">
                Emergency & Essential Utility Contacts
            </h2>
            
            {contacts.length === 0 ? (
                <div className="p-8 bg-yellow-50 rounded-xl border border-yellow-300 shadow-inner">
                    <p className="text-lg text-yellow-800">
                        ⚠️ Contact list is empty. Please ask an administrator to populate the list in Firestore.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {contacts.map((contact, index) => (
                        <div key={index} className="flex flex-col p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition duration-200 border-l-4 border-indigo-400">
                            <h3 className="text-xl font-bold text-indigo-700 border-b pb-1">{contact.service}</h3>
                            <p className="text-sm text-gray-500 mt-2 flex-grow">{contact.desc || 'General contact information.'}</p>
                            
                            <a 
                                href={`tel:${contact.phone}`} 
                                className="mt-4 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition duration-150 flex items-center justify-center space-x-2 text-lg transform hover:scale-[1.01]"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 3.116a1 1 0 01-.29 1.054L4.854 9.854a1 1 0 000 1.414l5 5a1 1 0 001.414 0l2.853-2.853a1 1 0 011.054-.29l3.116.74A1 1 0 0118 16.847V19a1 1 0 01-1 1h-2.153a1 1 0 01-.986-.836l-.74-3.116a1 1 0 01.29-1.054l3.116.74a1 1 0 01.986.836H17a1 1 0 01-1 1h-2.153a1 1 0 01-.986-.836l-.74-3.116a1 1 0 01.29-1.054L14.854 9.854a1 1 0 000-1.414l-5-5a1 1 0 00-1.414 0L4.854 9.854a1 1 0 01-1.054.29l-3.116-.74A1 1 0 012 3z" />
                                </svg>
                                <span>{contact.phone}</span>
                            </a>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- 5. Caretaker Verification Panel Component (NEW FEATURE) ---
const UserVerificationPanel = ({ db }) => {
    const [pendingUsers, setPendingUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!db) return;

        // Query for users whose role is explicitly 'pending'
        const q = query(collectionGroup(db, 'profiles'), where('role', '==', 'pending'));

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const usersList = snapshot.docs.map(doc => ({
                    userId: doc.ref.parent.parent.id, // Extract UID from document path
                    ...doc.data(),
                    docId: doc.id
                }));
                // Filter out profiles without block/room (those who haven't submitted the form yet)
                const submittedUsers = usersList.filter(u => u.tempBlock && u.tempRoom);
                
                // Sort by creation time, oldest first
                submittedUsers.sort((a, b) => 
                    (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)
                );
                
                setPendingUsers(submittedUsers);
                setLoading(false);
            },
            (e) => {
                console.error("Error fetching pending users:", e);
                setError("Error loading pending users. Check permissions and index.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db]);


    const verifyUser = useCallback(async (user) => {
        try {
            // Path to the specific userProfile document for this user
            const profileDocRef = getUserProfileDoc(db, user.userId);

            await updateDoc(profileDocRef, {
                role: 'student', // Grant access
                block: user.tempBlock,
                roomNumber: user.tempRoom,
                verifiedAt: serverTimestamp(),
                tempBlock: null, // Clear temp fields
                tempRoom: null, // Clear temp fields
                status: 'verified' // Mark status
            });

            // Optimistically remove user from the local list
            setPendingUsers(prev => prev.filter(u => u.userId !== user.userId));

        } catch (e) {
            console.error("Verification error:", e);
            alert(`Failed to verify user: ${e.message}`);
        }
    }, [db]);


    if (loading) return <LoadingSpinner message="Loading pending users..." />;
    if (error) return <ErrorMessage message={error} />;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-3xl font-extrabold text-indigo-700 border-b-4 border-yellow-300 pb-3">
                User Verification <span className='text-yellow-600 ml-2'>({pendingUsers.length} Pending)</span>
            </h2>
            <p className='text-gray-600 bg-yellow-50 p-4 rounded-xl border border-yellow-300'>
                Approve users who have submitted their Block and Room details for verification.
            </p>

            {pendingUsers.length === 0 ? (
                <div className="text-center p-12 bg-white rounded-2xl shadow-inner border border-dashed border-green-300">
                    <p className="text-2xl text-green-600 font-bold">
                        ✅ No Users Pending Verification
                    </p>
                    <p className="text-lg text-gray-500 mt-2">
                        All users have been verified or have not submitted their details yet.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {pendingUsers.map(user => (
                        <div key={user.userId} className="bg-white p-6 rounded-2xl shadow-lg border-l-4 border-yellow-500 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 md:space-x-4">
                            <div className='flex-grow'>
                                <p className="text-lg font-bold text-gray-800">{user.email}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Requested: <span className='font-semibold'>{user.tempBlock}-{user.tempRoom}</span>
                                </p>
                                <p className='text-xs text-gray-400 mt-1'>Registered: {user.createdAt?.toDate().toLocaleDateString() || 'N/A'}</p>
                            </div>

                            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 w-full md:w-auto items-center">
                                <button
                                    onClick={() => verifyUser(user)}
                                    className="py-3 px-6 rounded-xl shadow-md text-white font-bold bg-green-600 hover:bg-green-700 transition duration-150 w-full sm:w-auto"
                                >
                                    Approve Access
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// --- 6. Auth Page Component (Login/Signup) ---
const AuthPage = ({ auth, setAppError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      console.error("Auth Error:", error);
      let message = "Authentication failed. Please check your credentials.";
      
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        message = "Invalid email or password. Please try again.";
      } else if (error.code === 'auth/email-already-in-use') {
        message = "This email is already registered. Please sign in instead.";
      } else if (error.code === 'auth/weak-password') {
        message = "Password must be at least 6 characters long.";
      }
      setAuthError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-2xl border-t-8 border-indigo-600">
        <h2 className="text-4xl font-extrabold text-center text-indigo-700 mb-8">
          {isRegistering ? 'Register Access' : 'Hostel Sign In'}
        </h2>

        {authError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative mb-6" role="alert">
            <span className="block sm:inline">{authError}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full p-3 border border-gray-300 rounded-xl shadow-inner focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
              placeholder="e.g., student@hostel.edu"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full p-3 border border-gray-300 rounded-xl shadow-inner focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
              placeholder="Minimum 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl shadow-lg text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150 disabled:opacity-50 transform hover:scale-[1.005]"
          >
            {isSubmitting ? 'Processing...' : (isRegistering ? 'Register & Request Access' : 'Sign In')}
          </button>
        </form>

        <div className="mt-7 text-center">
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setAuthError(null); }}
            className="text-sm text-indigo-600 hover:text-indigo-500 font-medium transition duration-150"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Register Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 7. Pending Verification UI ---
const PendingVerification = ({ db, userProfile, handleSignOut }) => {
    const [block, setBlock] = useState(userProfile.tempBlock || BLOCKS[0] || 'A');
    const [roomNumber, setRoomNumber] = useState(userProfile.tempRoom || '');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmitDetails = useCallback(async (e) => {
        e.preventDefault();
        setMessage('');
        setIsLoading(true);

        if (!roomNumber.trim()) {
            setMessage('Please enter a valid room number.');
            setIsLoading(false);
            return;
        }

        try {
            const profileDocRef = getUserProfileDoc(db, userProfile.userId);
            await updateDoc(profileDocRef, {
                tempBlock: block,
                tempRoom: roomNumber.trim().toUpperCase(),
                status: 'submitted', // New status for Caretaker visibility
            });
            setMessage('✅ Details submitted for review! The caretaker has been notified.');
        } catch (e) {
            console.error("Submission error:", e);
            setMessage(`❌ Failed to submit details: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [db, userProfile, block, roomNumber]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-lg bg-white p-8 rounded-2xl shadow-2xl border-l-8 border-yellow-500">
                <h2 className="text-3xl font-bold text-yellow-700 mb-4">Access Pending Verification</h2>
                <p className="text-lg text-gray-700 mb-6">
                    To finalize your access, please tell us your location details below.
                </p>
                
                {message && (
                    <div className={`p-4 mb-6 rounded-xl text-sm font-semibold ${message.startsWith('✅') ? 'bg-green-100 text-green-800 border border-green-400' : 'bg-red-100 text-red-800 border border-red-400'}`}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmitDetails} className='space-y-4'>
                    <div className='grid grid-cols-2 gap-4'>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Select Block</label>
                            <select
                                value={block}
                                onChange={(e) => setBlock(e.target.value)}
                                required
                                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                            >
                                {BLOCKS.map(b => (
                                    <option key={b} value={b}>Block {b}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Room Number</label>
                            <input
                                type="text"
                                value={roomNumber}
                                onChange={(e) => setRoomNumber(e.target.value)}
                                required
                                placeholder="e.g., 301, G15"
                                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 px-4 rounded-xl shadow-md text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150 disabled:opacity-50 flex items-center justify-center space-x-2 transform hover:scale-[1.005]"
                    >
                        {isLoading ? <LoadingSpinner size="h-5 w-5 border-2" /> : "Submit for Approval"}
                    </button>
                </form>

                <div className="flex justify-end mt-6 border-t pt-4">
                  <button 
                    onClick={handleSignOut}
                    className="py-2 px-4 rounded-xl text-white bg-red-500 hover:bg-red-600 transition duration-150 shadow-md font-medium"
                  >
                    Sign Out
                  </button>
                </div>
            </div>
        </div>
    );
};

// --- 8. Utility Components (Spinner and Error) ---
const LoadingSpinner = ({ message = "Loading...", size = "h-8 w-8 border-4" }) => (
  <div className="flex flex-col items-center justify-center p-8 text-indigo-600">
    <div className={`border-indigo-600 border-t-transparent rounded-full animate-spin ${size}`}></div>
    <span className="mt-3 text-lg font-medium">{message}</span>
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl shadow-md">
    <h3 className="font-bold text-lg">Application Error</h3>
    <p className="mt-1 text-sm">{message}</p>
  </div>
);


// =================================================================
// -------------------- MAIN APPLICATION COMPONENT -----------------
// =================================================================

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('home');
  const [appError, setAppError] = useState(null);

  // Initialize Firebase and Authentication
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
      setAppError("Firebase configuration is missing or invalid.");
      setLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestore);
      setAuth(firebaseAuth);

      const fetchUserProfile = async (firestore, uid) => {
        try {
          const profileDocRef = getUserProfileDoc(firestore, uid);
          const profileSnap = await getDoc(profileDocRef);

          if (profileSnap.exists()) {
            const profile = profileSnap.data();
            setUserProfile(profile);
            setCurrentPage(profile.role === 'caretaker' ? 'dashboard' : 'report');
          } else {
            // User profile NOT FOUND -> create PENDING profile
            const pendingProfile = {
              userId: uid,
              role: 'pending', 
              email: getAuth(firestore.app).currentUser?.email || 'N/A',
              createdAt: serverTimestamp(),
            };
            await setDoc(profileDocRef, pendingProfile);
            setUserProfile(pendingProfile);
            setCurrentPage('pending');
          }
        } catch (error) {
          console.error("Error fetching/setting user profile:", error);
          setAppError("Could not load user profile.");
        }
      };

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          // Pass db into fetchUserProfile now that it's set
          if (firestore) {
             await fetchUserProfile(firestore, user.uid);
          } else {
             // Handle case where firestore isn't ready yet, though unlikely
             setAppError("Database connection not ready.");
          }
        } else {
          setUserId(null);
          setUserProfile(null);
          setCurrentPage('auth');
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase Initialization Error:", e);
      setAppError("Failed to initialize the application.");
      setLoading(false);
    }
  }, []);

  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
      setUserProfile(null);
      setUserId(null);
      setCurrentPage('auth');
    }
  };

  // Render Logic
  if (appError) {
    return <ErrorMessage message={appError} />;
  }

  if (loading || !db || !auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner message="Starting Application..." />
      </div>
    );
  }
  
  // Renders Login/Register Page
  if (!userId || !userProfile || currentPage === 'auth') {
      return <AuthPage auth={auth} setAppError={setAppError} />;
  }
  
  // Renders Pending Verification Form
  if (userProfile.role === 'pending') {
      return <PendingVerification db={db} userProfile={userProfile} handleSignOut={handleSignOut} />;
  }

  const isCaretaker = userProfile?.role === 'caretaker';

  // Navigation Logic
  const getNavItems = (isCaretaker) => {
    let items = [{ key: 'report', label: 'Report Issue' }, { key: 'contacts', label: 'Contacts' }];
    if (isCaretaker) {
      items = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'urgent', label: '⚡ Urgent Tasks' },
        { key: 'verify', label: '👤 Verify Users' }, // NEW ITEM
        ...BLOCKS.map(block => ({ key: `block-${block}`, label: `Block ${block}` })),
        { key: 'contacts', label: 'Contacts' }
      ];
    }
    return items;
  };

  const renderContent = () => {
    if (userProfile.role === 'student' || userProfile.role === 'pending') {
        // Students are always routed to the reporter page or the default content
        if (currentPage === 'report' || currentPage === 'home') {
            // Note: If profile is pending, it should never reach here, but this is a safety fallback.
            return <StudentReporter db={db} userProfile={userProfile} appId={appId} />;
        }
    }

    // Caretaker Routes
    if (userProfile.role === 'caretaker') {
        if (currentPage === 'verify') {
            return <UserVerificationPanel db={db} />;
        }
        if (currentPage === 'dashboard' || currentPage.startsWith('block-') || currentPage === 'urgent') {
          const filterBlock = currentPage.startsWith('block-') ? currentPage.split('-')[1] : null;
          const filterUrgent = currentPage === 'urgent';
          return <CaretakerDashboard db={db} appId={appId} filterBlock={filterBlock} filterUrgent={filterUrgent} />;
        }
    }
    
    // General Contact Page
    if (currentPage === 'contacts') {
      return <ContactsPage db={db} appId={appId} />;
    }
    
    // Default fallback 
    return <div className="p-8 text-center text-gray-500">Select a navigation tab.</div>;
  };

  const statusLabel = isCaretaker ? `Caretaker (${userProfile.email})` : 
      (userProfile.block && userProfile.roomNumber) ? `Room: ${userProfile.block}-${userProfile.roomNumber}` : 'Room: Unverified';


  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-indigo-700 text-white shadow-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-extrabold tracking-wide">Hostel Issue Tracker</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm bg-indigo-800 px-3 py-1 rounded-full hidden sm:block font-medium">
              {statusLabel}
            </span>
            <button 
              onClick={handleSignOut} 
              className="text-sm px-3 py-1 rounded-full bg-red-500 hover:bg-red-600 transition duration-150 shadow-md font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white shadow-md sticky top-[56px] z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-2 sm:space-x-4 overflow-x-auto py-3">
            {getNavItems(isCaretaker).map((item) => (
              <button
                key={item.key}
                onClick={() => setCurrentPage(item.key)}
                className={`py-2 px-4 text-sm font-bold rounded-xl transition-colors duration-200 whitespace-nowrap shadow-sm transform hover:scale-[1.03] ${
                  currentPage === item.key
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {renderContent()}
      </main>
    </div>
  );
};

// Wrapper component to export correctly
const AppWrapper = () => {
  return <App />;
};


export default AppWrapper;
