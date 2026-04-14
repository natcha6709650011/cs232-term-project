const loginForm = document.getElementById("loginForm");
const successOverlay = document.getElementById("successOverlay");
const failOverlay = document.getElementById("failOverlay");
const continueBtn = document.getElementById("continueBtn");
const closeFailBtn = document.getElementById("closeFailBtn");

loginForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const studentId = document.getElementById("studentId").value.trim();
  const password = document.getElementById("password").value.trim();

  // ทดสอบก่อน
  if (studentId === "670000001" && password === "1234") {
    successOverlay.classList.remove("hidden");
  } else {
    failOverlay.classList.remove("hidden");
  }
});

continueBtn.addEventListener("click", function () {
  successOverlay.classList.add("hidden");
  // window.location.href = "home.html";
});

closeFailBtn.addEventListener("click", function () {
  failOverlay.classList.add("hidden");
});