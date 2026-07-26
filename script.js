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
const amountEntryCard = document.getElementById("amountEntryCard");
const loadingCard = document.getElementById("loadingCard");
const mainCard = document.getElementById("mainCard");
const verifyCard = document.getElementById("verifyCard");
const statusOverlay = document.getElementById("statusOverlay");

const customAmountInput = document.getElementById("customAmountInput");
const proceedToPayBtn = document.getElementById("proceedToPayBtn");
const amountDisplay = document.getElementById("amountDisplay");
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

// UPI Details
const upiId = "sunnypro@fam"; // Replace with your actual upi id
const upiName = "Nexa Payments";
let currentTxnId = null;
let currentTxnData = null;
let timerInterval = null;

// ==========================================
// 3. ROUTING & INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentTxnId = urlParams.get('TXN');

    if (currentTxnId) {
        loadTransaction(currentTxnId);
    } else {
        amountEntryCard.style.display = "flex";
    }
});

// ==========================================
// 4. CREATE TRANSACTION (Home Screen)
// ==========================================
proceedToPayBtn.addEventListener("click", () => {
    const amt = Number(customAmountInput.value);
    if (!amt || amt < 1 || amt > 10000000) {
        alert("Enter amount between ₹1 and ₹1,00,00,000");
        return;
    }

    amountEntryCard.style.display = "none";
    loadingCard.style.display = "flex";

    setTimeout(() => {
        const newTxnId = "NPSK" + Math.random().toString(36).substr(2, 10).toUpperCase();
        
        db.ref('transactions/' + newTxnId).set({
            amount: amt,
            createdAt: Date.now(),
            status: "pending"
        }).then(() => {
            window.location.href = `/?TXN=${newTxnId}`;
        });
    }, 1500); // 1.5s Loading.gif
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
            showOverlayContent(alreadyPaidContent);
            return;
        }

        if (currentTxnData.status === "expired") {
            showOverlayContent(expiredContent);
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
    amountDisplay.innerText = `₹${currentTxnData.amount}`;
    
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${currentTxnData.amount}&cu=INR`;
    
    new QRCode(qrcodeDiv, {
        text: upiUrl, width: 220, height: 220,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    payBtn.addEventListener("click", () => window.location.href = upiUrl);
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
        uploadBox.innerText = "✅ Screenshot Attached";
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
// 7. COMPLEX DATABASE VERIFICATION LOGIC
// ==========================================
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

submitProofBtn.addEventListener("click", async () => {
    const utr = utrInput.value.trim().toUpperCase();
    const file = fileInput.files[0];

    if (!utr || !file) {
        alert("Please upload screenshot and enter ID");
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

        let isFamPay = /^FAMIB\d{10}$/.test(utr);
        let isPhonePe = /^T\d{22}$/.test(utr);
        let isPaytm = /^\d{12}$/.test(utr);

        let updates = {};

        // ------------------ FAMPAY LOGIC ------------------
        if (isFamPay) {
            let numPart = parseInt(utr.substring(5));
            let recentSnap = await db.ref('recent_fampay').once('value');
            
            if (recentSnap.exists()) {
                let recent = recentSnap.val();
                let minDiff = Math.floor((Date.now() - recent.timestamp) / 60000);
                if (minDiff < 1) minDiff = 1;
                
                let requiredIncrement = minDiff * 3000;
                
                if (numPart <= recent.id || (numPart - recent.id) < requiredIncrement) {
                    failMsgEl.innerText = "Payment not received";
                    showOverlayContent(failureContent);
                    return;
                }
            }
            updates['recent_fampay'] = { id: numPart, timestamp: Date.now() };

        // ------------------ PHONEPE LOGIC ------------------
        } else if (isPhonePe) {
            let yy = utr.substr(1, 2);
            let mm = utr.substr(3, 2);
            let dd = utr.substr(5, 2);
            let hh = utr.substr(7, 2);
            let min = utr.substr(9, 2);
            let ss = utr.substr(11, 2);
            
            let phonePeDate = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
            let txnStart = new Date(currentTxnData.createdAt);
            let txnEnd = new Date(currentTxnData.createdAt + (10 * 60000));

            let today = new Date();
            let isToday = (phonePeDate.getDate() === today.getDate() && phonePeDate.getMonth() === today.getMonth() && phonePeDate.getFullYear() === today.getFullYear());

            if (!isToday || phonePeDate < txnStart || phonePeDate > txnEnd) {
                failMsgEl.innerText = "Payment not received";
                showOverlayContent(failureContent);
                return;
            }

        // ------------------ PAYTM LOGIC ------------------
        } else if (isPaytm) {
            let now = new Date();
            let yearLastDigit = (now.getFullYear() % 10).toString();
            let dayOfYear = getDayOfYear(now).toString().padStart(3, '0');
            let requiredPrefix = yearLastDigit + dayOfYear;

            if (!utr.startsWith(requiredPrefix)) {
                failMsgEl.innerText = "Payment not received";
                showOverlayContent(failureContent);
                return;
            }

            let seqPart = parseInt(utr.substring(4));

            let recentSnap = await db.ref('recent_paytm').once('value');
            if (recentSnap.exists()) {
                let recent = recentSnap.val();
                let minDiff = Math.floor((Date.now() - recent.timestamp) / 60000);
                if (minDiff < 1) minDiff = 1;
                
                let requiredIncrement = minDiff * 1000;

                if (seqPart <= recent.id || (seqPart - recent.id) < requiredIncrement) {
                    failMsgEl.innerText = "Payment not received";
                    showOverlayContent(failureContent);
                    return;
                }
            }
            updates['recent_paytm'] = { id: seqPart, timestamp: Date.now() };

        } else {
            failMsgEl.innerText = "Payment not received";
            showOverlayContent(failureContent);
            return;
        }

        // ==========================================
        // 8. FINALIZE SUCCESS
        // ==========================================
        updates[`transactions/${currentTxnId}/status`] = 'paid';
        updates[`used_utrs/${utr}`] = true;
        
        await db.ref().update(updates);
        
        clearInterval(timerInterval);
        showOverlayContent(successContent);

    } catch (error) {
        console.error("DB Error:", error);
        failMsgEl.innerText = "Database connection error.";
        showOverlayContent(failureContent);
    }
});
