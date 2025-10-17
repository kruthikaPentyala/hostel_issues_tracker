import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc,
  query, where, onSnapshot, runTransaction, 
  serverTimestamp, collectionGroup, getDocs
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
  collection(db, `artifacts/${appId}/public/data/${collectionName}`);

// Utility function to get the private user profile path
const getUserProfileDoc = (db, userId) =>
  doc(db, `artifacts/${appId}/users/${userId}/profiles/userProfile`);

// Utility function to get the issues collection path
const getIssuesCollectionRef = (db) => 
  getPublicCollectionRef(db, 'issue-tracker-issues');


// =================================================================
// -------------------- FIREBASE UTILITY API (Caretaker Logic) -----------------
// =================================================================

/**
 * Updates the status of an issue document.
 * @param {Firestore} db 
 * @param {string} issueId 
 * @param {string} newStatus 
 */
const updateIssueStatus = async (db, issueId, newStatus) => {
    try {
        const issueRef = doc(getIssuesCollectionRef(db), issueId);
        await updateDoc(issueRef, { status: newStatus });
    } catch (e) {
        console.error("Error updating issue status:", e);
        throw new Error("Failed to update status.");
    }
};

/**
 * Approves a pending user's access and assigns their permanent room details.
 * @param {Firestore} db 
 * @param {object} user 
 */
const approveUserAccess = async (db, user) => {
  try {
    if (!db) {
      console.error("Database reference is missing.");
      throw new Error("Database reference is missing.");
    }

    if (!user || !user.userId) {
      console.error("Invalid user object:", user);
      throw new Error("Invalid user object passed to approveUserAccess.");
    }

    const profileDocRef = getUserProfileDoc(db, user.userId);

    console.log("Profile Doc Ref:", profileDocRef); // 👀 check what this prints
    console.log("Doc Path:", profileDocRef?.path);

    if (!profileDocRef || !profileDocRef.path) {
      throw new Error("Invalid Firestore document reference.");
    }

    await updateDoc(profileDocRef, {
      role: 'student',
      block: user.tempBlock,
      roomNumber: user.tempRoom,
      verifiedAt: serverTimestamp(),
      tempBlock: null,
      tempRoom: null,
    });

    console.log("User verified successfully!");
  } catch (e) {
    console.error("Verification error:", e);
    throw new Error("Failed to verify user.");
  }
};



// =================================================================
// -------------------- CORE COMPONENTS -----------------
// =================================================================

// --- 1. Issue Card Component (Used by Caretaker Dashboard) ---
const IssueCard = ({ issue, updateStatus }) => {
  const statusClasses = {
    New: 'status-new',
    'In Progress': 'status-in-progress',
    Resolved: 'status-resolved',
  };

  const urgencyClass = issue.isUrgent ? 'tag-urgent' : '';
  const createdAt = issue.createdAt?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="issue-card">
      <div className="issue-card-header">
        <span className={`issue-status-tag ${urgencyClass}`}>
          {issue.isUrgent ? '⚡ URGENT PRIORITY' : 'Standard'}
        </span>
        <span className={`issue-status-tag ${statusClasses[issue.status]}`}>
          {issue.status}
        </span>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem'}}>
        <div className='issue-location'>
            {issue.block}-{issue.floor}F
        </div>
        <h3 className="issue-category-title">
          {issue.category} Issue
        </h3>
      </div>
      
      <p className="issue-description">
        {issue.description}
      </p>

      <div style={{fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb'}}>
        Reported on: <span style={{fontWeight: '600'}}>{createdAt}</span>
      </div>

      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem'}}>
        <span style={{fontWeight: '600', color: '#374151'}}>
          Rooms Tagged:
        </span>
        <span className="issue-reporter-tags">
          {issue.reporters.slice(0, 4).map((r, index) => (
            <span key={index} className="reporter-tag">
              {r.room}
            </span>
          ))}
          {issue.reporters.length > 4 && (
            <span style={{fontSize: '0.75rem', color: '#6b7280', paddingLeft: '0.25rem'}}>+{issue.reporters.length - 4}</span>
          )}
        </span>
      </div>

      <div className="issue-actions">
        {issue.status !== 'Resolved' && (
          <button
            onClick={() => updateStatus(issue.id, 'In Progress')}
            className="btn-action btn-start-work"
            disabled={issue.status === 'In Progress'}
          >
            {issue.status === 'In Progress' ? 'In Progress' : 'Start Work'}
          </button>
        )}
        {(issue.status === 'New' || issue.status === 'In Progress') && (
          <button
            onClick={() => updateStatus(issue.id, 'Resolved')}
            className="btn-action btn-mark-resolved"
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
      // Calls the centralized API function
      await updateIssueStatus(db, issueId, newStatus);
    } catch (e) {
      console.error("Error updating issue status:", e);
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

  const titleClass = filterUrgent ? 'dashboard-title urgent' : 'dashboard-title';

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
      <h2 className={titleClass}>
        {issueTitle} 
        <span style={{color: '#4f46e5', marginLeft: '0.75rem', backgroundColor: '#e0e7ff', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '1.5rem'}}>({issues.length})</span>
      </h2>
      
      {issues.length === 0 ? (
        <div style={{textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '1rem', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.06)'}}>
          <p style={{fontSize: '1.5rem', color: '#10b981', fontWeight: '700'}}>
            🎉 All Clear! 
          </p>
          <p style={{fontSize: '1.125rem', color: '#6b7280', marginTop: '0.5rem'}}>
            No active issues found {filterBlock ? `for Block ${filterBlock}` : 'across all blocks'}.
          </p>
        </div>
      ) : (
        <div className="issue-grid">
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

    if (!floor || !category || !description) {
        setMessage('❌ Please fill in all required fields.');
        setIsLoading(false);
        return;
    }

    try {
        const consolidationKey = `${block}_${floor}_${category}`;
        const issuesRef = getIssuesCollectionRef(db);
        const reporterData = { room: roomNumber, userId: userProfile.userId };
        const timestamp = serverTimestamp();
        
        // --- 1. PRE-TRANSACTION CHECK: Find the ID of the existing issue (if any) ---
        // This query runs outside the transaction just to find the target ID.
        const existingQuery = query(
            issuesRef,
            where('consolidationKey', '==', consolidationKey),
            where('status', 'in', ['New', 'In Progress']) 
        );
        const preCheckSnapshot = await getDocs(existingQuery);
        const existingIssueId = preCheckSnapshot.empty ? null : preCheckSnapshot.docs[0].id;
        
        
        await runTransaction(db, async (transaction) => {
            if (existingIssueId) {
                // --- CONSOLIDATE: Tag existing task using its known ID ---
                const existingIssueRef = doc(issuesRef, existingIssueId);
                
                // CRUCIAL: Read the document again *inside* the transaction using the valid reference.
                const existingDocSnapshot = await transaction.get(existingIssueRef);
                
                if (!existingDocSnapshot.exists) {
                    throw new Error("Consolidation target disappeared during transaction.");
                }
                
                const existingReporters = existingDocSnapshot.data().reporters || [];
                const alreadyReported = existingReporters.some(r => r.room === roomNumber);

                if (!alreadyReported) {
                    transaction.update(existingIssueRef, {
                        reporters: [...existingReporters, reporterData],
                    });
                    setMessage(`✅ Issue consolidated! Your room (${roomNumber}) is now linked to the existing task.`);
                } else {
                    setMessage('⚠️ You already reported this exact issue. We\'re on it!');
                }
            } else {
                // --- CREATE: New Task ---
                const newIssue = {
                    block,
                    floor: parseInt(floor),
                    category,
                    description,
                    isUrgent,
                    status: 'New',
                    consolidationKey,
                    createdAt: timestamp,
                    reporters: [reporterData],
                };
                transaction.set(doc(issuesRef), newIssue);
                setMessage('✅ New issue created successfully! The caretaker has been notified.');
            }
        });

        // Clear form after successful transaction
        if (message.startsWith('✅') || message.startsWith('⚠️')) {
            setDescription('');
            setIsUrgent(false);
        }

    } catch (error) {
        console.error("Submission error:", error);
        // Include specific error to help with debugging if it's not the transaction issue
        setMessage(`❌ Submission failed: ${error.message}.`);
    } finally {
        setIsLoading(false);
    }
};

  return (
    <div className="card" style={{maxWidth: '48rem', margin: 'auto'}}>
      <h2 className="form-title">Report a New Issue</h2>
      
      <p className="message-box success" style={{marginBottom: '1.5rem'}}>
        Reporting from **Room {roomNumber}** in **Block {block}**. We consolidate identical reports automatically.
      </p>

      {message && (
        <div className={`message-box ${message.startsWith('✅') ? 'success' : message.startsWith('⚠️') ? 'warning' : 'error'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
        {/* Floor and Category Selection */}
        <div className="form-field-group">
          <div>
            <label className="form-label">Select Floor</label>
            <select
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              required
              className="form-select"
            >
              {FLOORS.map(f => (
                <option key={f} value={f}>Floor {f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Main Issue Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="form-select"
            >
              {ISSUE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Urgency Toggle */}
        <div className="urgent-toggle-box">
          <label htmlFor="urgency-toggle" className="urgent-label">
            <span>⚡ Immediate Urgency?</span>
            <span style={{fontSize: '0.75rem', fontWeight: '400', color: '#6b7280'}}>(Major incident, power cut, serious leak)</span>
          </label>
          <input
            id="urgency-toggle"
            type="checkbox"
            checked={isUrgent}
            onChange={(e) => setIsUrgent(e.target.checked)}
            style={{width: '1.5rem', height: '1.5rem', cursor: 'pointer'}}
          />
        </div>
        
        {/* Description */}
        <div>
          <label htmlFor="description" className="form-label">Detailed Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="5"
            required
            className="form-textarea"
            placeholder="Please describe the issue clearly and where exactly it is located."
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary"
        >
          {isLoading ? (
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
              <LoadingSpinner size="h-5 w-5 border-2" />
              <span>Submitting Report...</span>
            </div>
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
        <div className="max-w-4xl mx-auto" style={{maxWidth: '64rem', margin: 'auto'}}>
            <h2 className="dashboard-title">
                Emergency & Essential Utility Contacts
            </h2>
            
            {contacts.length === 0 ? (
                <div style={{textAlign: 'center', padding: '2rem', backgroundColor: '#fffbeb', borderRadius: '1rem', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)'}}>
                    <p style={{fontSize: '1.125rem', color: '#92400e'}}>
                        ⚠️ Contact list is empty. Please ask an administrator to populate the list in Firestore.
                    </p>
                </div>
            ) : (
                <div className="issue-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem'}}>
                    {contacts.map((contact, index) => (
                        <div key={index} className="issue-card" style={{borderLeft: '4px solid var(--color-primary)', borderTop: 'none', padding: '1.5rem'}}>
                            <h3 className="text-xl font-bold text-indigo-700 border-b pb-1">{contact.service}</h3>
                            <p className="text-sm text-gray-500 mt-2 flex-grow">{contact.desc || 'General contact information.'}</p>
                            
                            <a 
                                href={`tel:${contact.phone}`} 
                                className="btn-action" 
                                style={{backgroundColor: 'var(--color-success)', marginTop: '1rem', padding: '0.5rem 1rem', fontSize: '1rem'}}
                            >
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
                                    <svg xmlns="http://www.w3.org/2000/svg" style={{height: '1.25rem', width: '1.25rem'}} viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 3.116a1 1 0 01-.29 1.054L4.854 9.854a1 1 0 000 1.414l5 5a1 1 0 001.414 0l2.853-2.853a1 1 0 011.054-.29l3.116.74A1 1 0 0118 16.847V19a1 1 0 01-1 1h-2.153a1 1 0 01-.986-.836l-.74-3.116a1 1 0 01.29-1.054l3.116.74a1 1 0 01.986.836H17a1 1 0 01-1 1h-2.153a1 1 0 01-.986-.836l-.74-3.116a1 1 0 01.29-1.054L14.854 9.854a1 1 0 000-1.414l-5-5a1 1 0 00-1.414 0L4.854 9.854a1 1 0 01-1.054.29l-3.116-.74A1 1 0 012 3z" />
                                    </svg>
                                    <span>{contact.phone}</span>
                                </div>
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
        const q = query(collectionGroup(db, 'profiles'), where('role', 'in', ['pending', 'submitted']));

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const usersList = snapshot.docs.map(doc => ({
                    // We must find the user's UID which is the parent document ID of 'profiles' parent's parent
                    userId: doc.ref.parent.parent.id, 
                    ...doc.data(),
                    docId: doc.id
                }));
                // Filter out profiles who haven't submitted the form yet AND are not verified.
                const submittedUsers = usersList.filter(u => u.tempBlock && u.tempRoom && u.role !== 'student');
                
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
            // Calls the centralized API function
            await approveUserAccess(db, user);

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
        <div className="max-w-4xl mx-auto space-y-6" style={{maxWidth: '64rem', margin: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
            <h2 className="verification-header">
                User Verification <span style={{color: '#f59e0b', marginLeft: '0.5rem'}}>({pendingUsers.length} Pending)</span>
            </h2>
            <p className='message-box warning' style={{marginBottom: '1.5rem'}}>
                Approve users who have submitted their Block and Room details for verification.
            </p>

            {pendingUsers.length === 0 ? (
                <div style={{textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '1rem', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.06)'}}>
                    <p style={{fontSize: '1.5rem', color: '#10b981', fontWeight: '700'}}>
                        ✅ No Users Pending Verification
                    </p>
                    <p style={{fontSize: '1.125rem', color: '#6b7280', marginTop: '0.5rem'}}>
                        All users have been verified or have not submitted their details yet.
                    </p>
                </div>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                    {pendingUsers.map(user => (
                        <div key={user.userId} className="verification-user-card">
                            <div className='user-info'>
                                <p className="user-email">{user.email}</p>
                                <p className="user-requested-details">
                                    Requested: <span style={{fontWeight: '700'}}>{user.tempBlock}-{user.tempRoom}</span>
                                </p>
                                <p style={{fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem'}}>Registered: {user.createdAt?.toDate().toLocaleDateString() || 'N/A'}</p>
                            </div>

                            <button
                                onClick={() => verifyUser(user)}
                                className="btn-approve"
                            >
                                Approve Access
                            </button>
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
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">
          {isRegistering ? 'Register Access' : 'Hostel Sign In'}
        </h2>

        {authError && (
          <div className="message-box error" style={{marginBottom: '1.5rem'}}>
            <span className="block">{authError}</span>
          </div>
        )}

        <form onSubmit={handleAuth} style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
          <div>
            <label htmlFor="email" className="auth-form-label">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="auth-input"
              placeholder="e.g., student@hostel.edu"
            />
          </div>
          <div>
            <label htmlFor="password" className="auth-form-label">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="auth-input"
              placeholder="Minimum 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-btn-submit"
          >
            {isSubmitting ? 'Processing...' : (isRegistering ? 'Register & Request Access' : 'Sign In')}
          </button>
        </form>

        <div className="auth-switch-button">
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setAuthError(null); }}
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
        <div className="pending-page-container">
            <div className="pending-card">
                <h2 className="pending-title">Access Pending Verification</h2>
                <p className="text-lg text-gray-700 mb-6">
                    To finalize your access, please tell us your location details below.
                </p>
                
                {message && (
                    <div className={`message-box ${message.startsWith('✅') ? 'success' : 'error'}`} style={{marginBottom: '1.5rem'}}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmitDetails} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                    <div className='form-field-group'>
                        <div>
                            <label className="form-label">Select Block</label>
                            <select
                                value={block}
                                onChange={(e) => setBlock(e.target.value)}
                                required
                                className="form-select"
                            >
                                {BLOCKS.map(b => (
                                    <option key={b} value={b}>Block {b}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="form-label">Room Number</label>
                            <input
                                type="text"
                                value={roomNumber}
                                onChange={(e) => setRoomNumber(e.target.value)}
                                required
                                placeholder="e.g., 301, G15"
                                className="form-input"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-submit-details"
                    >
                        {isLoading ? <LoadingSpinner size="h-5 w-5 border-2" /> : "Submit for Approval"}
                    </button>
                </form>

                <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb'}}>
                  <button 
                    onClick={handleSignOut}
                    className="btn-signout"
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
  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', color: '#4f46e5'}}>
    <div className={`border-indigo-600 border-t-transparent rounded-full animate-spin ${size}`} style={{width: size.split(' ')[1], height: size.split(' ')[1], borderWidth: size.split(' ')[2], borderColor: '#4f46e5', borderTopColor: 'transparent'}}></div>
    <span style={{marginTop: '0.75rem', fontSize: '1.125rem', fontWeight: '500'}}>{message}</span>
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="message-box error">
    <h3 style={{fontWeight: '700', fontSize: '1.125rem'}}>Application Error</h3>
    <p style={{marginTop: '0.25rem', fontSize: '0.875rem'}}>{message}</p>
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
            
            // --- FIX: Ensure data is clean and defined before setting state ---
            const cleanProfile = {
                userId: uid,
                role: profile.role || 'pending',
                email: profile.email || getAuth(firestore.app).currentUser?.email || 'N/A',
                block: profile.block || '',
                roomNumber: profile.roomNumber || '',
                tempBlock: profile.tempBlock || '',
                tempRoom: profile.tempRoom || '',
                createdAt: profile.createdAt,
            };
            
            setUserProfile(cleanProfile);
            setCurrentPage(cleanProfile.role === 'caretaker' ? 'dashboard' : 'report');
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
        if (currentPage === 'dashboard' || currentPage.startsWith('block-') || currentPage.startsWith('block-') || currentPage === 'urgent') {
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
    return <div style={{padding: '2rem', textAlign: 'center', color: '#6b7280'}}>Select a navigation tab.</div>;
  };

  const statusLabel = isCaretaker ? `Caretaker (${userProfile.email})` : 
      (userProfile.block && userProfile.roomNumber) ? `Room: ${userProfile.block}-${userProfile.roomNumber}` : 'Room: Unverified';


  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1 className="header-title">Hostel Issue Tracker</h1>
          <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
            <span className="user-status">
              {statusLabel}
            </span>
            <button 
              onClick={handleSignOut} 
              className="btn-signout"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="app-nav">
        <div className="nav-list">
            {getNavItems(isCaretaker).map((item) => (
              <button
                key={item.key}
                onClick={() => setCurrentPage(item.key)}
                className={`nav-button ${currentPage === item.key ? 'active' : ''}`}
              >
                {item.label}
              </button>
            ))}
        </div>
      </nav>

      <main className="main-content">
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
