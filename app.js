document.addEventListener("DOMContentLoaded", () => {
  fetch("./componenets/lobby.html")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load navbar");
      return response.text();
    })
    .then((data) => {
      document.getElementById("lobbyCard").innerHTML = data;
    })
    .catch((error) => console.error("Error importing component:", error));
});
