import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import classNames from "classnames";
import {
  Tabs,
  TabsHeader,
  TabsBody,
  Tab,
  TabPanel,
  Spinner,
  Input,
} from "@material-tailwind/react";
import Link from "next/link";
import SearchIcon from "@mui/icons-material/Search";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import RefreshListsButton from "./RefreshListsButton";
import CheckDoneButton from "./CheckDoneButton";
import { useNowAllFollowers } from "@/lib/accessTwitch";
import { debugLogger } from "@/lib/debugLogger";

const ISO_UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type AppContainerProps = {
  accessToken: string;
  twitchUserId: string;
  onAuthenticationInvalid: (
    reason: "invalid_token" | "missing_scope"
  ) => void;
};

export default function AppContainer({
  accessToken,
  twitchUserId,
  onAuthenticationInvalid,
}: AppContainerProps) {
  debugLogger("AppContainer");
  const [activeTab, setActiveTab] = useState("Follower List");
  const [checkStatus, setCheckStatus] = useState<string | null>(null);

  const {
    nowAllFollowers,
    newAllFollowers,
    oldAllFollowers,
    lastCheckedAt,
    status,
    error,
    stale,
    isRefreshing,
    retryAt,
    canCommitBaseline,
    refresh,
    commitCurrentSnapshot,
  } = useNowAllFollowers({
    accessToken,
    authenticatedUserId: twitchUserId,
    onAuthenticationInvalid,
  });

  debugLogger("AppContainer2");
  const gridRef1 = useRef<AgGridReact<any>>(null);
  const gridRef2 = useRef<AgGridReact<any>>(null);
  const gridRef3 = useRef<AgGridReact<any>>(null);

  const data = useMemo(
    () => [
      {
        label: "Follower List",
        value: nowAllFollowers,
        gridRef: gridRef1,
      },
      {
        label: "New followed List",
        value: newAllFollowers,
        gridRef: gridRef2,
      },
      {
        label: "Unfollowed List",
        value: oldAllFollowers,
        gridRef: gridRef3,
      },
    ],
    [nowAllFollowers, newAllFollowers, oldAllFollowers]
  );

  function CustomLoadingCellRenderer() {
    return (
      <Spinner
        color="purple"
        className="h-16 w-16 text-gray-900/50"
        aria-hidden="true"
      />
    );
  }

  const loadingCellRenderer = useMemo(() => {
    debugLogger("loadingCellRenderer");
    return CustomLoadingCellRenderer;
  }, []);

  const onFirstDataRendered = useCallback((params: any) => {
    debugLogger("onFirstDataRendered");
    params.api.sizeColumnsToFit();
  }, []);

  const onGridSizeChanged = useCallback((params: any) => {
    debugLogger("onGridSizeChanged");
    params.api.sizeColumnsToFit();
  }, []);

  useEffect(() => {
    data.forEach((item) => {
      const api = item.gridRef.current?.api;
      if (!api) {
        return;
      }
      if (isRefreshing) {
        api.showLoadingOverlay();
      } else {
        api.hideOverlay();
      }
    });
  }, [data, isRefreshing]);

  const refreshLists = useCallback(() => {
    debugLogger("refreshLists");
    setCheckStatus(null);
    return refresh();
  }, [refresh]);

  const onChecked = useCallback(() => {
    debugLogger("onChecked");
    if (commitCurrentSnapshot()) {
      setCheckStatus("Follower baseline and check date saved.");
    }
  }, [commitCurrentSnapshot]);

  function formatToLocaleString(date: Date): string {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatStoredDate(value: string): string {
    // Legacy releases stored an already-localized string. Re-parsing values
    // such as 06/09/2026 would swap month/day in another locale, so only the
    // unambiguous UTC format written by the new snapshot envelope is parsed.
    if (!ISO_UTC_TIMESTAMP.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : formatToLocaleString(parsed);
  }

  const statusMessage = isRefreshing
    ? nowAllFollowers === null
      ? "Loading follower lists. Check done will be available after a complete refresh."
      : "Refreshing follower lists. The last loaded lists remain available while you wait."
    : checkStatus ?? "Follower lists updated.";

  return (
    <div className="mt-5">
      <RefreshListsButton
        onRefresh={refreshLists}
        isRefreshing={isRefreshing}
        retryAt={retryAt}
      />
      {status === "error" && error ? (
        <div
          className="mb-4 min-w-0 break-words rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          role="alert"
          aria-atomic="true"
        >
          {error.message}{" "}
          {stale
            ? "Showing the last successfully loaded follower lists. Check done is unavailable until a complete refresh succeeds."
            : "No follower list was accepted. Use Refresh Lists to try again."}
        </div>
      ) : (
        <div
          className="mb-4 min-w-0 break-words text-sm dark:text-white"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {statusMessage}
        </div>
      )}
      <div aria-busy={isRefreshing}>
        <Tabs value={activeTab}>
        <TabsHeader
          className={classNames(
            "rounded-none",
            "border-b",
            "border-purple-800",
            "bg-transparent",
            "p-0",
            "z-10" // nextra の mobile nav が z-11 なので
          )}
          indicatorProps={{
            className: classNames(
              "bg-transparent",
              "border-b-2",
              "border-purple-800",
              "shadow-none",
              "rounded-none"
            ),
          }}
        >
          {data.map(({ label }) => (
            <Tab
              key={label}
              value={label}
              onClick={() => setActiveTab(label)}
              className={classNames(
                activeTab === label ? "dark:text-white" : "text-gray-500",
                "text-xs",
                "sm:text-base"
              )}
            >
              {label}
            </Tab>
          ))}
        </TabsHeader>
        <TabsBody>
          {data.map(({ label, value, gridRef }) => (
            <TabPanel key={label} value={label}>
              <div
                className={classNames(
                  "flex",
                  "flex-col-reverse",
                  "space-y-reverse",
                  "space-y-3",
                  "md:space-y-0",
                  "md:flex-row",
                  "mb-1",
                  "mt-5",
                  "sm:mt-0" // header と body の間
                )}
              >
                <div className="w-56 mr-3">
                  <Input
                    label="Search..."
                    icon={<SearchIcon />}
                    crossOrigin=""
                    id="filter-text-box"
                    onInput={(event) =>
                      gridRef.current?.api.setQuickFilter(
                        (event.target as HTMLInputElement).value
                      )
                    }
                  />
                </div>
                <div className="flex items-center">
                  <CheckDoneButton
                    onChecked={onChecked}
                    isDisabled={
                      activeTab === "Follower List" || !canCommitBaseline
                    }
                  />
                  {lastCheckedAt !== null && (
                    <span className="ml-4 dark:text-white !text-sm sm:!text-base">
                      Last checked: {formatStoredDate(lastCheckedAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="ag-theme-alpine">
                <AgGridReact
                  ref={gridRef}
                  rowData={value}
                  columnDefs={[
                    {
                      headerName: "Followed At",
                      field: "followed_at",
                      minWidth: 170,
                      cellRenderer: (params: any) =>
                        `${formatToLocaleString(new Date(params.value))}`,
                      getQuickFilterText: (params: any) =>
                        `${formatToLocaleString(new Date(params.value))}`,
                    },
                    {
                      headerName: "Display Name",
                      field: "user_name",
                      minWidth: 150,
                    },
                    {
                      headerName: "User Name",
                      field: "user_login",
                      minWidth: 150,
                      cellRenderer: (params: any) => (
                        <Link
                          href={`https://www.twitch.tv/${params.value}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            // ブラウザデフォルトの上書きする
                            color: "-webkit-link",
                            textDecoration: "underline",
                            cursor: "pointer",
                            colorScheme: "normal",
                          }}
                        >
                          {params.value}
                        </Link>
                      ),
                    },
                    { headerName: "User ID", field: "user_id", minWidth: 110 },
                  ]}
                  domLayout={"autoHeight"}
                  animateRows={true}
                  pagination={true}
                  paginationPageSize={15}
                  onFirstDataRendered={onFirstDataRendered}
                  onGridSizeChanged={onGridSizeChanged}
                  loadingOverlayComponent={loadingCellRenderer}
                  suppressDragLeaveHidesColumns={true}
                ></AgGridReact>
              </div>
            </TabPanel>
          ))}
        </TabsBody>
        </Tabs>
      </div>
    </div>
  );
}
