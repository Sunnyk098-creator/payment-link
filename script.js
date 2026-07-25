document.addEventListener("DOMContentLoaded", () => {
    // Configuration
    const upiId = "sunnypro@fam";
    const upiName = "sunny kumar";
    
    // Telegram Bot Config
    const botToken = "8832657466:AAE_O-t4bDOOF_t_kW5MV2K-3BoX7mBASvw";
    const chatId = "8522410574"; 

    // UI Elements
    const amountEntryCard = document.getElementById("amountEntryCard");
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

    const processingContent = document.getElementById("processingContent");
    const successContent = document.getElementById("successContent");
    const failureContent = document.getElementById("failureContent");
    const scanProgress = document.getElementById("scanProgress");

    let finalAmount = "0";
    let generatedUpiUrl = "";

    // 1. Check URL for existing amount
    const urlParams = new URLSearchParams(window.location.search);
    let urlAmount = urlParams.get('amount');

    if (urlAmount && !isNaN(urlAmount) && Number(urlAmount) >= 1 && Number(urlAmount) <= 10000000) {
        // Valid amount in URL, skip to QR
        finalAmount = urlAmount;
        setupQRPage();
    } else {
        // No valid amount, show entry screen
        amountEntryCard.style.display = "flex";
    }

    // 2. Amount Entry Logic
    proceedToPayBtn.addEventListener("click", () => {
        const inputVal = Number(customAmountInput.value);
        if (!inputVal || isNaN(inputVal) || inputVal < 1 || inputVal > 10000000) {
            alert("⚠️ Please enter a valid amount between ₹1 and ₹1,00,00,000.");
            return;
        }
        finalAmount = inputVal.toString();
        amountEntryCard.style.display = "none";
        setupQRPage();
    });

    // 3. Setup QR & Intent Links
    function setupQRPage() {
        mainCard.style.display = "flex";
        amountDisplay.innerText = `₹${finalAmount}`;
        
        generatedUpiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${finalAmount}&cu=INR`;
        
        qrcodeDiv.innerHTML = ""; // Clear existing QR
        new QRCode(qrcodeDiv, {
            text: generatedUpiUrl,
            width: 220, height: 220,
            colorDark : "#000000", colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }

    // Navigation
    payBtn.addEventListener("click", () => window.location.href = generatedUpiUrl);
    
    paidBtn.addEventListener("click", () => {
        mainCard.style.display = "none";
        verifyCard.style.display = "flex";
    });
    
    cancelVerifyBtn.addEventListener("click", () => {
        verifyCard.style.display = "none";
        mainCard.style.display = "flex";
        resetInputs();
    });
    
    retryBtn.addEventListener("click", () => {
        statusOverlay.classList.remove("active");
        verifyCard.style.display = "flex";
        resetInputs();
    });

    // Image Upload UX
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            uploadBox.classList.add("has-file");
            uploadBox.innerText = "✅ Screenshot Attached";
        }
    });

    function resetInputs() {
        fileInput.value = "";
        utrInput.value = "";
        uploadBox.classList.remove("has-file");
        uploadBox.innerText = "📸 Click to Select Proof";
        scanProgress.style.width = "0%";
    }

    // Telegram API Function
    function sendToTelegram(imageFile, utrId) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN');
        const dayStr = now.toLocaleDateString('en-IN', { weekday: 'long' });
        const timeStr = now.toLocaleTimeString('en-IN');

        const caption = `🚀 *New UPI Payment*\n\n*Name* :- Sunny kumar\n*Amount* :- ₹${finalAmount}\n*UTR/TXN ID* :- \`${utrId}\`\n\n*Date* :- ${dateStr}\n*Day* :- ${dayStr}\n*Time* :- ${timeStr}`;

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', imageFile);
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown');

        fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            body: formData
        }).catch(error => console.error("Telegram API Error:", error));
    }

    // Validation & 1.5s Processing
    submitProofBtn.addEventListener("click", () => {
        const utrVal = utrInput.value.trim().toUpperCase();
        const file = fileInput.files[0];

        if (!utrVal || !file) {
            alert("⚠️ Please upload the screenshot AND enter the UTR/TXN ID.");
            return;
        }

        verifyCard.style.display = "none";
        statusOverlay.classList.add("active");
        processingContent.style.display = "block";
        successContent.style.display = "none";
        failureContent.style.display = "none";

        // Trigger 1.5s progress bar animation
        setTimeout(() => { scanProgress.style.width = "100%"; }, 50);

        let isFormatValid = false;
        const isNumeric = /^\d+$/.test(utrVal);

        if (isNumeric) {
            // Number logic: Exactly 12 digits
            if (utrVal.length === 12) isFormatValid = true;
        } else {
            // Text logic: FAMIB + 10 digits
            if (/^FAMIB\d{10}$/.test(utrVal)) isFormatValid = true;
        }

        // Exact 1.5 Sec Timer Execution
        setTimeout(() => {
            processingContent.style.display = "none";
            if (isFormatValid) {
                successContent.style.display = "block";
                sendToTelegram(file, utrVal); // Sends to bot
            } else {
                failureContent.style.display = "block";
            }
        }, 1500); 
    });
});
