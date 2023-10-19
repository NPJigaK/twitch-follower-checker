import classNames from "classnames";
import AuthenticateWithTwitch from "./AuthenticateWithTwitch";
import AppContainer from "./AppContainer";
import { useIsTwitchTokenAvailable } from "@/lib/accessTwitch";

function MainContainer() {
  const isTwitchTokenAvailable = useIsTwitchTokenAvailable();
  let container;

  if (isTwitchTokenAvailable === null) {
    container = null;
  } else if (isTwitchTokenAvailable) {
    container = <AppContainer />;
  } else {
    container = <AuthenticateWithTwitch />;
  }

  return (
    <main>
      <div
        className={classNames(
          "container",
          "mx-auto",
          "nx-pl-[max(env(safe-area-inset-left),1.5rem)]",
          "nx-pr-[max(env(safe-area-inset-right),1.5rem)]"
        )}
      >
        {container}
      </div>
    </main>
  );
}

export default MainContainer;
