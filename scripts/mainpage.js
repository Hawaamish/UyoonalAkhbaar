// Extracted from mainpage.html. Existing section comments describe the page's behavior.

//!if (!localStorage.getItem("user")) {
   // window.location.href = "../index.html";
//}

function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("userName");
    window.location.href = "../index.html";
}

// 👋 Show the welcome greeting with the logged-in user's name
window.addEventListener("DOMContentLoaded", () => {
    const userName = localStorage.getItem("userName") || localStorage.getItem("user");
    const badge = document.getElementById("welcomeBadge");

    if (userName && badge) {
        badge.textContent = "اهلًا وسهلًا " + userName;
        badge.style.display = "block";
    }
});
