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

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. DOM ELEMENTS & BOT DETAILS
// ==========================================
const TELEGRAM_BOT_TOKEN = "8832657466:AAE_O-t4bDOOF_t_kW5MV2K-3BoX7mBASvw";
const TELEGRAM_CHAT_ID = "8522410574";

const blockedScreen = document.getElementById("blockedScreen");
const amountEntryCard = document.getElementById("amountEntryCard");
const loadingCard = document.getElementById("loadingCard");
const mainCard = document.getElementById("mainCard");
const verifyCard = document.getElementById("verifyCard");
const statusOverlay = document.getElementById("statusOverlay");

const customAmountInput = document.getElementById("customAmountInput");
const proceedToPayBtn = document.getElementById("proceedToPayBtn");
const noAmountBtn = document.getElementById("noAmountBtn");
const amountDisplay = document.getElementById("amountDisplay");
const qrcodeDiv = document.getElementById("qrcode");
const payBtn = document.getElementById("payBtn");
const paidBtn = document.getElementById("paidBtn");
const timerBox = document.getElementById("timerBox");
const flexibleCheck = document.getElementById("flexibleCheck");
const upiIdDisplayBox = document.getElementById("upiIdDisplayBox");

const cancelVerifyBtn = document.getElementById("cancelVerifyBtn");
const submitProofBtn = document.getElementById("submitProofBtn");
const retryBtn = document.getElementById("retryBtn");
const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const utrInput = document.getElementById("utrInput");

const timeRemainingEl = document.getElementById("timeRemaining");
const failMsgEl = document.getElementById("failMsg");

const processingContent = document.getElementById("processingContent");
const successContent = document.getElementById("successContent");
const failureContent = document.getElementById("failureContent");
const expiredContent = document.getElementById("expiredContent");
const alreadyPaidContent = document.getElementById("alreadyPaidContent");

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

    if (currentTxnId === 'no') {
        currentTxnData = { status: 'pending', amount: 0, isFlexible: true };
        timerBox.style.display = "none";
        setupQR();
    } else if (currentTxnId) {
        loadTransaction(currentTxnId);
    } else {
        blockedScreen.style.display = "flex";
        amountEntryCard.style.display = "none";
        checkAdminStatus();
    }
});

async function checkAdminStatus() {
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        if (!ipResponse.ok) throw new Error("Could not fetch IP");
        const ipData = await ipResponse.json();
        const userIp = ipData.ip;

        const adminLockRef = db.ref('admin/locked_ip');
        const result = await adminLockRef.transaction((currentIpInDb) => {
            if (currentIpInDb === null) return userIp;
            else return; 
        });

        if (result.committed || (result.snapshot.exists() && result.snapshot.val() === userIp)) {
            amountEntryCard.style.display = "flex";
            blockedScreen.style.display = "none";
        } else {
            blockedScreen.style.display = "flex";
            amountEntryCard.style.display = "none";
        }
    } catch (error) {
        console.error("Admin check failed:", error);
        blockedScreen.style.display = "flex"; 
    }
}

// ==========================================
// 4. CREATE TRANSACTIONS
// ==========================================
proceedToPayBtn.addEventListener("click", () => {
    let amt = Number(customAmountInput.value);
    const isFlexible = flexibleCheck.checked;

    if (isFlexible) {
        amt = 0;
    } else {
        if (!amt || amt < 1 || amt > 10000000) {
            alert("⚠️ Please enter a valid amount between ₹1 and ₹1,00,00,000");
            return;
        }
    }

    amountEntryCard.style.display = "none";
    loadingCard.style.display = "flex";

    setTimeout(() => {
        const newTxnId = "NPSK" + Math.random().toString(36).substr(2, 10).toUpperCase();
        db.ref('transactions/' + newTxnId).set({
            amount: amt,
            isFlexible: isFlexible,
            createdAt: Date.now(),
            status: "pending"
        }).then(() => {
            window.location.href = `/?TXN=${newTxnId}`;
        });
    }, 1500); 
});

noAmountBtn.addEventListener("click", () => {
    amountEntryCard.style.display = "none";
    loadingCard.style.display = "flex";

    setTimeout(() => {
        window.location.href = `/?TXN=no`;
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
            showOverlayContent(alreadyPaidContent);
            return;
        }

        if (currentTxnData.status === "expired") {
            showOverlayContent(expiredContent);
            return;
        }

        const timePassed = Date.now() - currentTxnData.createdAt;
        if (timePassed > 600000) {
            db.ref('transactions/' + txnId).update({ status: "expired" });
            showOverlayContent(expiredContent);
            return;
        }

        setupQR();
        startTimer(600000 - timePassed);
    });
}

function setupQR() {
    mainCard.style.display = "flex";

    let upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR`;

    if (currentTxnId === 'no' || currentTxnData.isFlexible) {
        amountDisplay.innerText = upiId; 
        amountDisplay.style.fontSize = "1.2rem";
        amountDisplay.style.letterSpacing = "1px";
        upiIdDisplayBox.style.display = "block";
        if(currentTxnId === 'no') payBtn.style.display = "none"; 
    } else {
        amountDisplay.innerText = `₹${currentTxnData.amount}`;
        upiUrl += `&am=${currentTxnData.amount}`;
    }
    
    qrcodeDiv.innerHTML = ""; 
    new QRCode(qrcodeDiv, {
        text: upiUrl,
        width: 220, height: 220,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    payBtn.addEventListener("click", () => {
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
// 7. DYNAMIC TIME-BASED LOGIC
// ==========================================
function calculateRequiredIncrement(prevTimestamp, currentTimestamp) {
    let totalIncrementNeeded = 0;
    let currTime = new Date(prevTimestamp);
    const endTime = new Date(currentTimestamp);

    while (currTime < endTime) {
        let hour = currTime.getHours();
        if (hour >= 23 || hour < 6) totalIncrementNeeded += 16.66;
        else if (hour >= 6 && hour < 10) totalIncrementNeeded += 33.33;
        else totalIncrementNeeded += 66.66;
        currTime.setSeconds(currTime.getSeconds() + 1);
    }
    return Math.floor(totalIncrementNeeded);
}

submitProofBtn.addEventListener("click", async () => {
    const utr = utrInput.value.trim().toUpperCase();
    const file = fileInput.files[0];

    if (!utr || !file) {
        alert("⚠️ Please upload screenshot and enter valid ID.");
        return;
    }

    verifyCard.style.display = "none";
    showOverlayContent(processingContent); 

    await new Promise(r => setTimeout(r, 1500));

    try {
        let usedSnap = await db.ref(`used_utrs/${utr}`).once('value');
        if (usedSnap.exists()) {
            failMsgEl.innerText = "Payment not received"; 
            showOverlayContent(failureContent);
            return;
        }

        let isFamPay = /^FMPIB\d{10}$/.test(utr);
        let isPhonePe = /^T\d{22}$/.test(utr);

        let updates = {};
        let nowTimestamp = Date.now();

        // ------------------ FAMPAY ------------------
        if (isFamPay) {
            let numPart = parseInt(utr.substring(5)); 
            let recentSnap = await db.ref('recent_fampay').once('value');

            if (recentSnap.exists()) {
                let recent = recentSnap.val();
                
                // SMART WINDOW LOGIC: 
                // Determine transaction creation time for fair increment calculation
                let txnStartTime;
                if (currentTxnId === 'no') {
                    // For flexible/no amount QR, give a 10 min grace period from current time
                    txnStartTime = nowTimestamp - (10 * 60000); 
                } else {
                    // For standard links, use the exact time the link was created!
                    txnStartTime = currentTxnData.createdAt;
                }

                let requiredIncrement = 10;
                
                // Only demand increment up to the txnStartTime, NOT current time
                if (recent.timestamp < txnStartTime) {
                    requiredIncrement = calculateRequiredIncrement(recent.timestamp, txnStartTime);
                }
                
                if (requiredIncrement < 10) requiredIncrement = 10; 

                if (numPart <= recent.id || (numPart - recent.id) < requiredIncrement) {
                    failMsgEl.innerText = "Payment not received";
                    showOverlayContent(failureContent);
                    return;
                }
            }
            
            // Save current transaction as latest in DB
            let d = new Date(nowTimestamp);
            updates['recent_fampay'] = { 
                id: numPart, timestamp: nowTimestamp,
                date: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(),
                hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds()
            };
        } 
        // ------------------ PHONEPE ------------------
        else if (isPhonePe) {
            let yy = utr.substr(1, 2);
            let mm = utr.substr(3, 2);
            let dd = utr.substr(5, 2);
            let hh = utr.substr(7, 2);
            let min = utr.substr(9, 2);
            let ss = utr.substr(11, 2);
            
            let phonePeDate = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`);
            let today = new Date();
            let isToday = (phonePeDate.getDate() === today.getDate() && phonePeDate.getMonth() === today.getMonth() && phonePeDate.getFullYear() === today.getFullYear());

            if (currentTxnId === 'no') {
                if (!isToday || phonePeDate > today) {
                    failMsgEl.innerText = "Payment not received";
                    showOverlayContent(failureContent);
                    return;
                }
            } else {
                let txnStart = new Date(currentTxnData.createdAt);
                let txnEnd = new Date(currentTxnData.createdAt + (10 * 60000));

                if (!isToday || phonePeDate < txnStart || phonePeDate > txnEnd) {
                    failMsgEl.innerText = "Payment not received";
                    showOverlayContent(failureContent);
                    return;
                }
            }
        }
        else {
            failMsgEl.innerText = "Payment not received";
            showOverlayContent(failureContent);
            return;
        }

        // ==========================================
        // 8. FINALIZE SUCCESS & SEND TELEGRAM ALERT
        // ==========================================
        if (currentTxnId !== 'no') {
            updates[`transactions/${currentTxnId}/status`] = 'paid';
        }
        updates[`used_utrs/${utr}`] = true;
        
        await db.ref().update(updates);
        
        clearInterval(timerInterval); 
        
        // --- TELEGRAM NOTIFICATION LOGIC ---
        try {
            let userIp = "Unknown IP";
            const ipRes = await fetch('https://api.ipify.org?format=json');
            if (ipRes.ok) {
                const ipData = await ipRes.json();
                userIp = ipData.ip;
            }

            let paidAmount = currentTxnData.amount;
            if (currentTxnData.isFlexible || currentTxnId === 'no') {
                paidAmount = "Flexible (Scan to know)";
            }

            const captionText = `🔔 New Payment Received\n\n💰 Amount: ₹${paidAmount}\n🆔 Transaction ID: ${utr}\n🌐 User IP: ${userIp}\n\n✅ A new payment has been received`;

            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('photo', file); 
            formData.append('caption', captionText);

            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            }).catch(e => console.error("Telegram Notification Error:", e));

        } catch (e) {
            console.error("Failed to send Telegram notification:", e);
        }
        // -----------------------------------

        showOverlayContent(successContent);

    } catch (error) {
        console.error("DB Error:", error);
        failMsgEl.innerText = "Database connection error.";
        showOverlayContent(failureContent);
    }
});
