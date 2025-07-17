let wpmHistory = [];
let accuracyHistory = [];
const typingElement = document.getElementById("typing-subheading");
if (typingElement) {
  const phrases = ["Master Your Speed", "Track. Improve. Dominate."];
  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function typeEffect() {
    const currentPhrase = phrases[phraseIndex];
    if (isDeleting) {
      charIndex--;
      typingElement.textContent = currentPhrase.substring(0, charIndex);
      if (charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        setTimeout(typeEffect, 500);
      } else {
        setTimeout(typeEffect, 50);
      }
    } else {
      charIndex++;
      typingElement.textContent = currentPhrase.substring(0, charIndex);
      if (charIndex === currentPhrase.length) {
        isDeleting = true;
        setTimeout(typeEffect, 1000);
      } else {
        setTimeout(typeEffect, 100);
      }
    }
  }

  typeEffect();
}
const letters = Array.from(document.querySelectorAll(".letter"));
let currentLetterIndex = 0;
let totalTyped = 0;
let correctTyped = 0;
let startTime = null;
let typingStarted = false;
const caret = document.getElementById("caret");
const accuracyDisplay = document.getElementById("accuracy-display");
const wpmDisplay = document.getElementById("wpm-display");
const timerDisplay = document.getElementById("timer-display");
// Get totalTime from query param if present, else default to 30
function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}
const totalTime = parseInt(getQueryParam("time")) || 30;
let timeLeft = totalTime;
let timerInterval = null;

caret.style.transform = "translate(0, 0)";

function getScrollOffset() {
  if (!typingStarted) return 0;

  const current = letters[currentLetterIndex];
  if (!current) return 0;

  const wordsContainer = document.getElementById("words");
  const container = wordsContainer.parentElement;
  const currentTop = current.offsetTop;
  const containerHeight = container.offsetHeight;

  const offset = currentTop - containerHeight / 2;

  // Clamp offset to zero or positive (no scrolling above start)
  return offset > 0 ? offset : 0;
}

function updateCaret() {
  const current = letters[currentLetterIndex];
  if (!current) {
    caret.style.display = "none";
    return;
  }

  const offset = getScrollOffset();

  requestAnimationFrame(() => {
    caret.style.transform = `translate(${current.offsetLeft}px, ${
      current.offsetTop - offset
    }px)`;
    caret.style.height = `${current.offsetHeight}px`;
    caret.style.display = "block";
  });
}

function updateScroll() {
  const offset = getScrollOffset();
  const wordsContainer = document.getElementById("words");

  wordsContainer.style.transform = `translateY(-${offset}px)`;
  //   caret.style.transform = `translateY(-${offset}px)`;
}

function updateHighlighting() {
  letters.forEach((letter, idx) => {
    letter.classList.remove("current");
    if (idx === currentLetterIndex) {
      letter.classList.add("current");
      updateCaret();
    }
  });
  updateScroll();
}

function updateAccuracy() {
  if (totalTyped === 0) {
    accuracyDisplay.textContent = `Accuracy: 100%`;
    return;
  }
  const accuracy = ((correctTyped / totalTyped) * 100).toFixed(1);
  accuracyDisplay.textContent = `Accuracy: ${accuracy}%`;
}

function updateWPM() {
  const now = new Date();
  const timeElapsed = (now - startTime) / 60000; // minutes
  const correctLetters = document.querySelectorAll(".letter.correct").length;

  let wpm;

  if (correctLetters < 1 || timeElapsed < 0.25 / 60) {
    wpm = 1;
  } else {
    wpm = Math.round(correctLetters / 5 / timeElapsed);
  }

  wpmDisplay.textContent = `WPM: ${wpm}`;
}

function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = `Time: ${timeLeft}s`;
    updateWPM();
    wpmHistory.push(parseInt(wpmDisplay.textContent.split(": ")[1]));
    const accuracyValue =
      totalTyped === 0 ? 100 : ((correctTyped / totalTyped) * 100).toFixed(1);
    accuracyHistory.push(parseFloat(accuracyValue));

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      document.removeEventListener("keydown", handleKeydown);
      timerDisplay.textContent = "Time's up!";
      showSummary();
    }
  }, 1000);
}
// Test duration buttons logic
const timePills = document.querySelectorAll(".pill[data-time]");
timePills.forEach((pill) => {
  pill.addEventListener("click", () => {
    const seconds = parseInt(pill.dataset.time);
    location.href = `/typing?time=${seconds}`;
  });
});

function handleBackspace() {
  if (currentLetterIndex > 0) {
    currentLetterIndex--;
    const removedLetter = letters[currentLetterIndex];
    if (removedLetter.classList.contains("correct")) correctTyped--;
    if (
      removedLetter.classList.contains("correct") ||
      removedLetter.classList.contains("incorrect")
    ) {
      totalTyped--;
    }
    removedLetter.classList.remove("correct", "incorrect");
  }
}

function handleTyping(key) {
  const currentLetter = letters[currentLetterIndex];
  if (!currentLetter) return;

  const expectedChar =
    currentLetter.textContent === "\u00A0" ? " " : currentLetter.textContent;

  if (key === expectedChar) {
    currentLetter.classList.add("correct");
    correctTyped++;
  } else {
    currentLetter.classList.add("incorrect");
  }

  totalTyped++;
  currentLetterIndex++;
}

function handleKeydown(e) {
  const key = e.key;
  if (key.length > 1 && key !== "Backspace") return;

  caret.classList.remove("blink");

  if (!startTime) {
    startTime = new Date();
    startTimer();
    typingStarted = true;
  }

  if (key === "Backspace") {
    handleBackspace();
  } else {
    handleTyping(key);
  }

  updateHighlighting();
  updateWPM();
  updateAccuracy();

  clearTimeout(caret.blinkTimeout);
  caret.blinkTimeout = setTimeout(() => {
    caret.classList.add("blink");
  }, 1000);
}

document.addEventListener("keydown", handleKeydown);

document.getElementById("restart-btn").addEventListener("click", () => {
  location.reload();
});

updateHighlighting();

function showSummary() {
  const wpm = wpmDisplay.textContent.split(": ")[1];
  const accuracy = accuracyDisplay.textContent.split(": ")[1];

  console.log("Submitting score:", { wpm, accuracy });

  fetch("/submit-score", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wpm, accuracy }),
  })
    .then((res) => {
      if (res.ok) {
        console.log("✅ Score submitted successfully");
      } else {
        console.error("❌ Failed to submit score");
      }
    })
    .catch((err) => {
      console.error("❌ Error submitting score:", err);
    });

  document.getElementById("summary-wpm").innerHTML = `
    <div style="font-size: 1.2rem; font-family: 'Roboto Mono', monospace;">
      <span style="color:#8fb3ff;">WPM: ${wpm}</span>
      &nbsp;&nbsp;&nbsp;
      <span style="color:#ffc266;">Accuracy: ${accuracy}</span>
    </div>
  `;

  const typingContainer = document.querySelector(".typing-container");
  const statsBar = document.querySelector(".stats-bar");
  const restartBtn = document.getElementById("restart-btn");
  const summaryScreen = document.getElementById("summary-screen");
  const summaryPill = document.querySelector(".summary-pill");
  const pillWrapper = document.getElementById("pill-wrapper");

  typingContainer.classList.add("fade-out");
  statsBar.classList.add("fade-out");
  restartBtn.classList.add("fade-out");
  pillWrapper.classList.add("fade-out");

  setTimeout(() => {
    typingContainer.style.display = "none";
    statsBar.style.display = "none";
    restartBtn.style.display = "none";
    pillWrapper.style.display = "none";

    summaryPill.style.display = "block";
    summaryScreen.classList.add("fade-in");
    summaryScreen.classList.add("show");
    summaryScreen.style.display = "block";

    setTimeout(() => {
      if (window.Chart) {
        const ctx = document.getElementById("wpmChart").getContext("2d");
        const peakWPM = Math.max(...wpmHistory);
        const avgWPM = (
          wpmHistory.reduce((sum, val) => sum + val, 0) / wpmHistory.length
        ).toFixed(1);
        const avgAcc = (
          accuracyHistory.reduce((sum, val) => sum + val, 0) /
          accuracyHistory.length
        ).toFixed(1);

        const peakIndex = wpmHistory.indexOf(peakWPM);

        new Chart(ctx, {
          type: "line",
          data: {
            labels: wpmHistory.map((_, i) => `${i + 1}s`),
            datasets: [
              {
                label: "WPM",
                data: wpmHistory,
                backgroundColor: "rgba(143, 179, 255, 0.2)",
                borderColor: "#8fb3ff",
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: wpmHistory.map((_, i) =>
                  i === peakIndex ? 6 : 2
                ),
                pointBackgroundColor: wpmHistory.map((_, i) =>
                  i === peakIndex ? "#ffd700" : "#8fb3ff"
                ),
              },
              {
                label: "Accuracy (%)",
                data: accuracyHistory,
                backgroundColor: "rgba(255, 194, 102, 0.2)",
                borderColor: "#ffc266",
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                pointRadius: 2,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                labels: {
                  color: "#d4e3ff",
                  font: {
                    family: "Roboto Mono",
                  },
                },
              },
              tooltip: {
                enabled: true,
                mode: "nearest",
                intersect: false,
              },
              annotation: {
                annotations: {
                  avgWPMLine: {
                    type: "line",
                    yMin: avgWPM,
                    yMax: avgWPM,
                    borderColor: "#8fb3ff",
                    borderWidth: 1,
                    borderDash: [6, 6],
                    label: {
                      content: `Avg: ${avgWPM} WPM`,
                      enabled: true,
                      color: "#8fb3ff",
                      backgroundColor: "#1e1f2f",
                      font: {
                        family: "Roboto Mono",
                      },
                    },
                  },
                  avgAccLine: {
                    type: "line",
                    yMin: avgAcc,
                    yMax: avgAcc,
                    borderColor: "#ffc266",
                    borderWidth: 1,
                    borderDash: [6, 6],
                    label: {
                      content: `Avg: ${avgAcc}%`,
                      enabled: true,
                      color: "#ffc266",
                      backgroundColor: "#1e1f2f",
                      font: {
                        family: "Roboto Mono",
                      },
                    },
                  },
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 120,
                ticks: {
                  color: "#d4e3ff",
                },
              },
              x: {
                ticks: {
                  color: "#d4e3ff",
                },
              },
            },
          },
        });
      }
    }, 150); // slight delay to ensure chart renders after showing
  }, 500);
}

caret.classList.add("blink");
