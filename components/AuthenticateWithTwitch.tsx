import { useRouter } from "next/router";
import { createButton, createSvgIcon } from "react-social-login-buttons";
import T from "prop-types";
import { clientId, redirectUri, scope } from "@/lib/constants";
import { Card, CardFooter, Typography } from "@material-tailwind/react";
import { navigateToUserLocalePage } from "@/lib/navigateToUserLocalePage";
import { Link } from "nextra-theme-docs";

function TwitchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 64 64"
    >
      <path
        d="M5.7 0L1.4 10.985V55.88h15.284V64h8.597l8.12-8.12h12.418l16.716-16.716V0H5.7zm51.104 36.3L47.25 45.85H31.967l-8.12 8.12v-8.12H10.952V5.73h45.85V36.3zM47.25 16.716v16.716h-5.73V16.716h5.73zm-15.284 0v16.716h-5.73V16.716h5.73z"
        fill="#6441a4"
        fill-rule="evenodd"
      />
    </svg>
  );
}

TwitchIcon.propTypes = {
  width: T.oneOfType([T.number, T.string]),
  height: T.oneOfType([T.number, T.string]),
};

const config = {
  text: "Authenticate with Twitch",
  icon: createSvgIcon(TwitchIcon),
  style: {
    background: "#a970ff",
    margin: "50px auto",
    padding: "10px",
  },
  activeStyle: { background: "#8644e9" },
};

const MyTwitchAuthenticateButton = createButton(config);

export default function AuthenticateWithTwitch() {
  const router = useRouter();
  const redirectToTwitch = () => {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
    router.push(authUrl);
  };
  return (
    <div className="flex items-center justify-center mb-4 mt-4">
      <Card className="w-96">
        <CardFooter className="pt-0">
          <MyTwitchAuthenticateButton onClick={redirectToTwitch} />
          <Typography variant="small" className="mt-6 flex justify-center">
            <Link href="javascript:void(0)" onClick={navigateToUserLocalePage}>
              What is Authenticate with Twitch?
            </Link>
          </Typography>
        </CardFooter>
      </Card>
    </div>
  );
}
