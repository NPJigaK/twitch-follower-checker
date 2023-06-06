// Receive a message from the main thread
self.addEventListener(
  "message",
  function (event) {
    let countdown = event.data; // Get the countdown value from the message

    // Set an interval
    const intervalId = setInterval(() => {
      countdown--; // decrement the countdown

      // When countdown is finished, clear the interval and post a message back to the main thread
      if (countdown <= 0) {
        clearInterval(intervalId);
        postMessage("finished");
      } else {
        // Otherwise, post the current countdown value back to the main thread
        postMessage(countdown);
      }
    }, 1000);
  },
  false
);
