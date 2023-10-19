self.onmessage = (event) => {
  let duration = event.data;
  let intervalId = setInterval(() => {
    duration -= 1;
    postMessage(duration);
    if (duration <= 0) {
      clearInterval(intervalId);
    }
  }, 1000);
};
