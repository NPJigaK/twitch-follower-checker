async function checkTokenExpired() {
  const res = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem(accessTokenKey)}`,
    },
  });

  const resJson = await res.json();
  // console.log(res.status);
  // console.log(resJson);
  if (res.status === 401 || resJson.expires_in < 3600) {
    // access token が失効している、もしくは1時間以内に失効する場合は再認証させる。
    alert("Access token is invalid. Please reauthenticate.");
    document.getElementById("authenticateButton").disabled = false; // たぶんこれ要らないけど念のため
    return false;
  }

  return true;
}

// ====== 認証ロジック ======
function authenticate() {
  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
  window.location.href = authUrl;
}
