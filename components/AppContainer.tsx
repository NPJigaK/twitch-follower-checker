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
import { lastCheckedDateKey, storedAllFollowersKey } from "@/lib/constants";

export default function AppContainer() {
  debugLogger("AppContainer");
  const [activeTab, setActiveTab] = useState("Follower List");
  const [lastCheckedDate, setLastCheckedDate] = useState<string | null>(
    localStorage.getItem(lastCheckedDateKey)
  );

  const {
    nowAllFollowers,
    newAllFollowers,
    oldAllFollowers,
    refresh,
    storeNowFollowes,
  } = useNowAllFollowers();

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
    return <Spinner color="purple" className="h-16 w-16 text-gray-900/50" />;
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

  const refreshLists = useCallback(async () => {
    debugLogger("refreshLists");
    data.forEach((item) => {
      if (item.gridRef.current) {
        item.gridRef.current.api.showLoadingOverlay();
      }
    });
    await refresh();
    data.forEach((item) => {
      if (item.gridRef.current) {
        item.gridRef.current.api.hideOverlay();
      }
    });
  }, [refresh, data]);

  const onChecked = useCallback(() => {
    debugLogger("onChecked");
    storeNowFollowes();
    const ftls = formatToLocaleString(new Date());
    localStorage.setItem(lastCheckedDateKey, ftls);
    setLastCheckedDate(ftls);
  }, [storeNowFollowes]);

  useEffect(() => {
    debugLogger("onChecked();");
    if (
      !localStorage.getItem(lastCheckedDateKey) &&
      localStorage.getItem(storedAllFollowersKey)
    ) {
      onChecked();
    }
  }, [onChecked]);

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

  return (
    <div className="mt-5">
      <RefreshListsButton onRefresh={refreshLists} />
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
                    isDisabled={activeTab === "Follower List"}
                  />
                  {lastCheckedDate !== null && (
                    <span className="ml-4 dark:text-white">
                      Last checked: {lastCheckedDate}
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
  );
}
