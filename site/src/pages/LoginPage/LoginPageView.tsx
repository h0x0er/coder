import type { Interpolation, Theme } from "@emotion/react";
import type { FC } from "react";
import { useLocation } from "react-router-dom";
import type { AuthMethods, BuildInfoResponse } from "api/typesGenerated";
import { CoderIcon } from "components/Icons/CoderIcon";
import { Loader } from "components/Loader/Loader";
import { getApplicationName, getLogoURL } from "utils/appearance";
import { retrieveRedirect } from "utils/redirect";
import { SignInForm } from "./SignInForm";

export interface LoginPageViewProps {
  authMethods: AuthMethods | undefined;
  error: unknown;
  isLoading: boolean;
  buildInfo?: BuildInfoResponse;
  termsOfService?: string;
  isSigningIn: boolean;
  onSignIn: (credentials: { email: string; password: string }) => void;
}

export const LoginPageView: FC<LoginPageViewProps> = ({
  authMethods,
  error,
  isLoading,
  buildInfo,
  termsOfService,
  isSigningIn,
  onSignIn,
}) => {
  const location = useLocation();
  const redirectTo = retrieveRedirect(location.search);
  // This allows messages to be displayed at the top of the sign in form.
  // Helpful for any redirects that want to inform the user of something.
  const message = new URLSearchParams(location.search).get("message");
  const applicationName = getApplicationName();
  const logoURL = getLogoURL();
  const applicationLogo = logoURL ? (
    <img
      alt={applicationName}
      src={logoURL}
      // This prevent browser to display the ugly error icon if the
      // image path is wrong or user didn't finish typing the url
      onError={(e) => (e.currentTarget.style.display = "none")}
      onLoad={(e) => (e.currentTarget.style.display = "inline")}
      css={{
        maxWidth: "200px",
      }}
      className="application-logo"
    />
  ) : (
    <CoderIcon fill="white" opacity={1} css={styles.icon} />
  );

  if (termsOfService) {
    return <>{termsOfService}</>;
  }

  return (
    <div css={styles.root}>
      <div css={styles.container}>
        {applicationLogo}
        {isLoading ? (
          <Loader />
        ) : (
          <SignInForm
            authMethods={authMethods}
            redirectTo={redirectTo}
            isSigningIn={isSigningIn}
            error={error}
            message={message}
            onSubmit={onSignIn}
          />
        )}
        <footer css={styles.footer}>
          <div>
            Copyright &copy; {new Date().getFullYear()} Coder Technologies, Inc.
          </div>
          <div>{buildInfo?.version}</div>
        </footer>
      </div>
    </div>
  );
};

const styles = {
  root: {
    padding: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
    textAlign: "center",
  },

  container: {
    width: "100%",
    maxWidth: 320,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },

  icon: {
    fontSize: 64,
  },

  footer: (theme) => ({
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginTop: 24,
  }),
} satisfies Record<string, Interpolation<Theme>>;
