// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD9USJllayyRWHq2FZr7sH6sEPyaXhu_Ek",
    authDomain: "nexa-payments.firebaseapp.com",
    databaseURL: "https://nexa-payments-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "nexa-payments",
    storageBucket: "nexa-payments.firebasestorage.app",
    messagingSenderId: "94538088085",
    appId: "1:94538088085:web:8befa95fd1d9424c8ea59c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const blockedScreen = document.getElementById("blockedScreen");
const amountEntryCard = document.getElementById("amountEntryCard");
const flexibleCheck = document.getElementById("flexibleCheck");
const loadingCard = document.getElementById("loadingCard");
const mainCard = document.getElementById("mainCard");
const verifyCard = document.getElementById("verifyCard");
const statusOverlay = document.getElementById("statusOverlay");

const customAmountInput = document.getElementById("customAmountInput");
const proceedToPayBtn = document.getElementById("proceedToPayBtn");
const amountDisplay = document.getElementById("amountDisplay");
const upiIdDisplayBox = document.getElementById("upiIdDisplayBox");
const qrcodeDiv = document.getElementById("qrcode");
const payBtn = document.getElementById("payBtn");
const paidBtn = document.getElementById("paidBtn");

const cancelVerifyBtn = document.getElementById("cancelVerifyBtn");
const submitProofBtn = document.getElementById("submitProofBtn");
const retryBtn = document.getElementById("retryBtn");
const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const utrInput = document.getElementById("utrInput");

const timeRemainingEl = document.getElementById("timeRemaining");
const failMsgEl = document.getElementById("failMsg");

// Content blocks in Status Overlay
const processingContent = document.getElementById("processingContent");
const successContent = document.getElementById("successContent");
const failureContent = document.getElementById("failureContent");
const expiredContent = document.getElementById("expiredContent");
const alreadyPaidContent = document.getElementById("alreadyPaidContent");

// UPI Details - Dedicated UPI ID
const upiId = "sunnypro@fam"; 
const upiName = "Nexa Payments";
let currentTxnId = null;
let currentTxnData = null;
let timerInterval = null;

// ==========================================
// 3. ROUTING, IP LOCK, & INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentTxnId = urlParams.get('TXN');

    if (currentTxnId) {
        // Banjara wale payment link ko sab dekh sakte hain
        loadTransaction(currentTxnId);
    } else {
        // Root page (Link creation) blocked Screen mein rahega jab tak check ho
        blockedScreen.style.display = "flex";
        amountEntryCard.style.display = "none";
        
        // NEW: IP-based Lock Mechanism
        checkAdminStatus();
    }
});

// NEW Function: Handle IP Lock/Admin registration
async function checkAdminStatus() {
    try {
        // Public IP Fetch
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        if (!ipResponse.ok) throw new Error("Could not fetch IP");
        const ipData = await ipResponse.json();
        const userIp = ipData.ip;

        // Firebase RTDB Logic: Use transaction to prevent race conditions
        const adminLockRef = db.ref('admin/locked_ip');
        
        const result = await adminLockRef.transaction((currentIpInDb) => {
            if (currentIpInDb === null) {
                // If node is empty, this user is the first one. Store their IP.
                return userIp;
            } else {
                // If not empty, do not update.
                return; 
            }
        });

        // Evaluate the result after transaction attempt
        if (result.committed) {
            // New admin registered, result.snapshot has the stored value (which is userIp)
            amountEntryCard.style.display = "flex";
            blockedScreen.style.display = "none";
        } else if (result.snapshot.exists() && result.snapshot.val() === userIp) {
            // User is already registered admin.
            amountEntryCard.style.display = "flex";
            blockedScreen.style.display = "none";
        } else {
            // Mismatch: Different admin registered. Block access.
            blockedScreen.style.display = "flex";
            amountEntryCard.style.display = "none";
        }

    } catch (error) {
        console.error("Admin check failed:", error);
        // Fallback: If IP service or DB fails, assume locked to be safe, show nothing.
        blockedScreen.style.display = "flex"; 
    }
}

// ==========================================
// 4. CREATE TRANSACTION (Home Screen)
// ==========================================
proceedToPayBtn.addEventListener("click", () => {
    // UPDATED: Allow flexibility
    const isFlexible = flexibleCheck.checked;
    let amt = Number(customAmountInput.value);

    // Flexible mode means user inputs amount on their app, we set 0 in link creation
    if (isFlexible) {
        amt = 0;
    } else {
        // Standard Amount mode, needs validation
        if (!amt || amt < 1 || amt > 10000000) {
            alert("⚠️ Please enter a valid amount between ₹1 and ₹1,00,00,000 OR check 'No Specific Amount' box.");
            return;
        }
    }

    amountEntryCard.style.display = "none";
    loadingCard.style.display = "flex"; // Shows light.gif

    setTimeout(() => {
        const newTxnId = "NPSK" + Math.random().toString(36).substr(2, 10).toUpperCase();
        
        db.ref('transactions/' + newTxnId).set({
            amount: amt,
            // UPDATED: Store flexibility indicator
            isFlexible: isFlexible, 
            createdAt: Date.now(),
            status: "pending"
        }).then(() => {
            window.location.href = `/?TXN=${newTxnId}`;
        });
    }, 1500); 
});

// ==========================================
// 5. LOAD & VALIDATE LINK
// ==========================================
function loadTransaction(txnId) {
    db.ref('transactions/' + txnId).once('value', (snapshot) => {
        if (!snapshot.exists()) {
            alert("Invalid Link");
            window.location.href = "/";
            return;
        }

        currentTxnData = snapshot.val();

        if (currentTxnData.status === "paid") {
            showOverlayContent(alreadyPaidContent); // Green Tick
            return;
        }

        if (currentTxnData.status === "expired") {
            showOverlayContent(expiredContent); // Red Cross
            return;
        }

        // Check time limit (10 minutes = 600,000 ms)
        const timePassed = Date.now() - currentTxnData.createdAt;
        if (timePassed > 600000) {
            db.ref('transactions/' + txnId).update({ status: "expired" });
            showOverlayContent(expiredContent);
            return;
        }

        // Setup QR and Timer
        setupQR();
        startTimer(600000 - timePassed);
    });
}

function setupQR() {
    mainCard.style.display = "flex";

    // UPDATED: Handle No Amount Display
    if (currentTxnData.isFlexible) {
        amountDisplay.innerText = `₹0`;
        // NEW: Show UPI ID display box below QR
        upiIdDisplayBox.style.display = "block"; 
    } else {
        amountDisplay.innerText = `₹${currentTxnData.amount}`;
        // Standard link, ensure UPI ID box is hidden
        upiIdDisplayBox.style.display = "none"; 
    }
    
    // UPDATED UPI URL: Some apps handle empty amount better with no parameter
    let upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR`;
    if (!currentTxnData.isFlexible) {
        upiUrl += `&am=${currentTxnData.amount}`;
    }
    
    qrcodeDiv.innerHTML = ""; // Clear existing QR
    new QRCode(qrcodeDiv, {
        text: upiUrl,
        width: 220, height: 220,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Paybtn action
    payBtn.addEventListener("click", () => {
        if(currentTxnData.isFlexible) {
            alert("⚠️ Important: User must manually enter amount in UPI App.");
        }
        window.location.href = upiUrl;
    });
}

function startTimer(durationMs) {
    let timeLeft = Math.floor(durationMs / 1000);
    
    timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            db.ref('transactions/' + currentTxnId).update({ status: "expired" });
            mainCard.style.display = "none";
            showOverlayContent(expiredContent);
            return;
        }

        let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        let s = (timeLeft % 60).toString().padStart(2, '0');
        timeRemainingEl.innerText = `${m}:${s}`;
        timeLeft--;
    }, 1000);
}

// ==========================================
// 6. VERIFICATION UI EVENTS
// ==========================================
paidBtn.addEventListener("click", () => {
    mainCard.style.display = "none";
    verifyCard.style.display = "flex";
});

cancelVerifyBtn.addEventListener("click", () => {
    verifyCard.style.display = "none";
    mainCard.style.display = "flex";
});

fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        uploadBox.classList.add("has-file");
        // NEW Green Tick inside status update box
        uploadBox.innerHTML = '<img src="tick.gif" class="inline-icon"> Screenshot Attached';
    }
});

retryBtn.addEventListener("click", () => {
    statusOverlay.classList.remove("active");
    verifyCard.style.display = "flex";
});

function showOverlayContent(contentElement) {
    statusOverlay.classList.add("active");
    processingContent.style.display = "none";
    successContent.style.display = "none";
    failureContent.style.display = "none";
    expiredContent.style.display = "none";
    alreadyPaidContent.style.display = "none";
    
    if(contentElement) contentElement.style.display = "block";
}

// ==========================================
// 7. COMPLEX DATABASE VERIFICATION LOGIC (Only FamPay & PhonePe)
// ==========================================
submitProofBtn.addEventListener("click", async () => {
    const utr = utrInput.value.trim().toUpperCase();
    const file = fileInput.files[0];

    if (!utr || !file) {
        alert("⚠️ Please upload screenshot and enter valid ID.");
        return;
    }

    verifyCard.style.display = "none";
    showOverlayContent(processingContent); // Shows eye.gif

    // Artificial 1.5s delay for processing UI
    await new Promise(r => setTimeout(r, 1500));

    try {
        // 1. Check if UTR/TXN is already used globally
        let usedSnap = await db.ref(`used_utrs/${utr}`).once('value');
        if (usedSnap.exists()) {
            failMsgEl.innerText = "Duplicate Transaction ID!";
            showOverlayContent(failureContent);
            return;
        }

        // Regex checks
        let isFamPay = /^FMPIB\d{10}$/.test(utr);
        let isPhonePe = /^T\d{22}$/.test(utr);

        let updates = {};

        // ------------------ FAMPAY LOGIC ------------------
        if (isFamPay) {
            let numPart = parseInt(utr.substring(5)); // Extract last 10 digits
            let recentSnap = await db.ref('recent_fampay').once('value');
            
            if (recentSnap.exists()) {
                let recent = recentSnap.val();
                let minDiff = Math.floor((Date.now() - recent.timestamp) / 60000);
                if (minDiff < 1) minDiff = 1; 
                
                // UPDATED FamPay Increment: Now set to 1000/min
                let requiredIncrement = minDiff * 1000;
                
                if (numPart <= recent.id || (numPart - recent.id) < requiredIncrement) {
                    failMsgEl.innerText = "Payment not received";
                    showOverlayContent(failureContent); // generic x gif
                    return;
                }
            }
            updates['recent_fampay'] = { id: numPart, timestamp: Date.now() };
        } 
        // ------------------ PHONEPE LOGIC (deep datetime window check) ------------------
        else if (isPhonePe) {
            let yy = utr.substr(1, 2);
            let mm = utr.substr(3, 2);
            let dd = utr.substr(5, 2);
            let hh = utr.substr(7, 2);
            let min = utr.substr(9, 2);
            let ss = utr.substr(11, 2);
            
            let phonePeDate = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
            let txnStart = new Date(currentTxnData.createdAt);
            // Window is transaction creation + 10 mins expiry
            let txnEnd = new Date(currentTxnData.createdAt + (10 * 60000));

            let today = new Date();
            // Validate date is today and time is within transaction creation window
            let isToday = (phonePeDate.getDate() === today.getDate() && phonePeDate.getMonth() === today.getMonth() && phonePeDate.getFullYear() === today.getFullYear());

            if (!isToday || phonePeDate < txnStart || phonePeDate > txnEnd) {
                failMsgEl.innerText = "Payment not received";
                showOverlayContent(failureContent);
                return;
            }
        }
        // ------------------ INVALID FORMAT ------------------
        else {
            failMsgEl.innerText = "Payment not received";
            showOverlayContent(failureContent);
            return;
        }

        // ==========================================
        // 8. FINALIZE SUCCESS (Update Database)
        // ==========================================
        updates[`transactions/${currentTxnId}/status`] = 'paid';
        updates[`used_utrs/${utr}`] = true;
        
        await db.ref().update(updates);
        
        clearInterval(timerInterval); // Stop timer
        showOverlayContent(successContent); // shows tick.gif

    } catch (error) {
        console.error("DB Error:", error);
        failMsgEl.innerText = "Database connection error.";
        showOverlayContent(failureContent);
    }
});
