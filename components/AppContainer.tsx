import {
  useState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ComponentProps,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
import type { GridReadyEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import RefreshListsButton from "./RefreshListsButton";
import CheckDoneButton from "./CheckDoneButton";
import { useNowAllFollowers } from "@/lib/accessTwitch";
import { debugLogger } from "@/lib/debugLogger";

// Material Tailwind's TabPanel forwards DOM props at runtime, but its
// published MotionProps type omits `id`. Keep the runtime component while
// exposing the DOM relationship attributes needed by the tabs pattern.
type AccessibleTabPanelProps = ComponentProps<typeof TabPanel> & {
  id?: string;
  inert?: "";
};
const AccessibleTabPanel = TabPanel as ComponentType<AccessibleTabPanelProps>;

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
  const tabsId = useId().replaceAll(":", "").toLowerCase();

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
  const tabRefs = useRef<Array<HTMLLIElement | null>>([]);

  const data = useMemo(
    () => [
      {
        label: "Follower List",
        value: nowAllFollowers,
        gridRef: gridRef1,
        tabId: `follower-list-tab-${tabsId}`,
        panelId: `follower-list-panel-${tabsId}`,
        searchId: `follower-list-search-${tabsId}`,
      },
      {
        label: "New followed List",
        value: newAllFollowers,
        gridRef: gridRef2,
        tabId: `new-followed-list-tab-${tabsId}`,
        panelId: `new-followed-list-panel-${tabsId}`,
        searchId: `new-followed-list-search-${tabsId}`,
      },
      {
        label: "Unfollowed List",
        value: oldAllFollowers,
        gridRef: gridRef3,
        tabId: `unfollowed-list-tab-${tabsId}`,
        panelId: `unfollowed-list-panel-${tabsId}`,
        searchId: `unfollowed-list-search-${tabsId}`,
      },
    ],
    [nowAllFollowers, newAllFollowers, oldAllFollowers, tabsId]
  );

  const onTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLLIElement>, index: number) => {
      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight":
          nextIndex = (index + 1) % data.length;
          break;
        case "ArrowLeft":
          nextIndex = (index - 1 + data.length) % data.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = data.length - 1;
          break;
        case "Enter":
        case " ":
        case "Spacebar":
          // Material Tailwind renders tabs as <li role="tab">, so it does
          // not provide the native button activation behavior for Enter or
          // Space. Trigger the same click path used by mouse activation.
          event.preventDefault();
          event.currentTarget.click();
          return;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = data[nextIndex];
      const nextTabElement = tabRefs.current[nextIndex];
      if (nextTabElement) {
        // Clicking keeps Material Tailwind's internal tab state in sync with
        // our accessible selected state. Focus is moved after activation so
        // the roving tab stop follows the selected tab.
        nextTabElement.click();
        nextTabElement.focus();
      } else {
        setActiveTab(nextTab.label);
      }
    },
    [data]
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

  const onGridReady = useCallback((params: GridReadyEvent, label: string) => {
    params.api.setGridAriaProperty("label", `${label} grid`);
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
          aria-label="Follower list tabs"
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
          {data.map(({ label, tabId, panelId }, index) => (
            <Tab
              key={label}
              value={label}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={tabId}
              aria-controls={panelId}
              aria-selected={activeTab === label}
              tabIndex={activeTab === label ? 0 : -1}
              onKeyDown={(event) => onTabKeyDown(event, index)}
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
          {data.map(({ label, value, gridRef, tabId, panelId, searchId }) => (
            <AccessibleTabPanel
              key={label}
              value={label}
              id={panelId}
              aria-labelledby={tabId}
              inert={activeTab !== label ? "" : undefined}
              aria-hidden={activeTab !== label}
            >
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
                    labelProps={{ htmlFor: searchId }}
                    icon={<SearchIcon />}
                    crossOrigin=""
                    id={searchId}
                    aria-label={`Search ${label}`}
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
                  onGridReady={(params) => onGridReady(params, label)}
                  loadingOverlayComponent={loadingCellRenderer}
                  suppressDragLeaveHidesColumns={true}
                ></AgGridReact>
              </div>
            </AccessibleTabPanel>
          ))}
        </TabsBody>
        </Tabs>
      </div>
    </div>
  );
}
