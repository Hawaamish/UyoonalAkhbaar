// 🚀 Runs when Google returns login response
function handleCredentialResponse(response) {
    const data = parseJwt(response.credential);
    const email = data.email;
    const name = data.name || email; // fallback to email if Google doesn't return a name

    const messageBox = document.getElementById("message");

    if (isValidEmail(email)) {

        // ✅ Save user session
        localStorage.setItem("user", email);
        localStorage.setItem("userName", name);

        messageBox.style.color = "green";
        messageBox.innerText = "Access Granted: " + email;
        document.body.classList.add("page-exit");

        // ✅ Redirect to main page
        setTimeout(() => {
            window.location.href = "mainpage.html";
        }, 1000);

    } else {
        messageBox.style.color = "red";
        messageBox.innerText = "Access Denied";

        google.accounts.id.disableAutoSelect();
    }
}


// 🔐 Decode JWT token
function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        console.error("Invalid token", e);
        return {};
    }
}


// ✅ Email validation rules
function isValidEmail(email) {

    if (!email) return false;

    // Rule 1: domain check
    if (!email.endsWith("@jameasaifiyah.edu")) {
        return false;
    }

    // Rule 2: no starting number
    const localPart = email.split("@")[0];

    if (/^[0-9]/.test(localPart)) {
        return false;
    }

    return true;
}


// 🔁 If already logged in → skip login page
window.onload = function () {
    const user = localStorage.getItem("user");

    if (user) {
        window.location.href = "mainpage.html";
    }
};