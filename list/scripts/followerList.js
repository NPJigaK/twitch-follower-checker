// Cell Renderer Functions
const twitchLinkInCellRenderer = (params) =>
  `<a href="https://www.twitch.tv/${params.value}" target="_blank" rel="noopener">${params.value}</a>`;
const formatToLocaleStringCellRenderer = (params) =>
  `${formatToLocaleString(new Date(params.value))}`;

// format date to locale string
function formatToLocaleString(date) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// grid options
const gridOptionsBase = {
  domLayout: "autoHeight",
  animateRows: true,
  onGridSizeChanged: (params) => params.api.sizeColumnsToFit(),
};

let gridOptions = {
  ...gridOptionsBase,
  columnDefs: [
    {
      headerName: "Followed At",
      field: "followed_at",
      minWidth: 170,
      cellRenderer: formatToLocaleStringCellRenderer,
      getQuickFilterText: formatToLocaleStringCellRenderer,
    },
    { headerName: "Display Name", field: "user_name", minWidth: 150 },
    {
      headerName: "User Name",
      field: "user_login",
      minWidth: 150,
      cellRenderer: twitchLinkInCellRenderer,
    },
    { headerName: "User ID", field: "user_id", minWidth: 110 },
  ],
  rowData: null,
  pagination: true,
  paginationPageSize: 15,
  quickFilterText: "",
  onGridReady: (params) => params.api.sizeColumnsToFit(),
};

let newFollowersGridOptions = {
  ...gridOptionsBase,
  columnDefs: [
    {
      headerName: "Followed At",
      field: "followed_at",
      minWidth: 170,
      cellRenderer: formatToLocaleStringCellRenderer,
    },
    { headerName: "Display Name", field: "user_name", minWidth: 175 },
    {
      headerName: "User Name",
      field: "user_login",
      minWidth: 150,
      cellRenderer: twitchLinkInCellRenderer,
    },
  ],
  rowData: null,
};

let unfollowedUsersOptions = {
  ...gridOptionsBase,
  columnDefs: [
    {
      headerName: "User Name",
      field: "user_login",
      minWidth: 150,
      cellRenderer: twitchLinkInCellRenderer,
    },
    { headerName: "User ID", field: "user_id", minWidth: 100 },
  ],
  rowData: null,
};

async function getNowAllFollowers() {
  // Twitch API で認証ユーザー情報を取得
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem(accessTokenKey)}`,
      "Client-Id": clientId,
    },
  });
  const resJson = await res.json();

  // Twitch API でフォロワーリストを取得
  const nowAllFollowers = await fetchFollowers(resJson.data[0].id);
  return nowAllFollowers;
}

async function displayFollowerList(nowAllFollowers) {
  if (gridOptions.rowData === null) {
    // フォロワー一覧表示: 初期化
    createListView(gridOptions, nowAllFollowers, "follower", "#follower-list");

    // 検索窓作成
    const filterInput = document.getElementById("quickFilterInput");
    filterInput.addEventListener("input", function () {
      const filterValue = filterInput.value;
      gridOptions.api.setQuickFilter(filterValue);
    });
  } else {
    // フォロワー一覧表示: 更新
    gridOptions.api.setRowData(nowAllFollowers);
  }
}

// display follower diff list
async function displayFollowerDiffList(nowAllFollowers) {
  // 更新用のフォロワーリストを作成して SessionStorage に保存しておく
  setFollowerListInSessionStorage(nowAllFollowers);
  const previousFollowers = JSON.parse(
    localStorage.getItem(previousFollowersKey)
  );

  if (previousFollowers !== null) {
    const newFollowers = getDifference(nowAllFollowers, previousFollowers);
    const unfollowedUsers = getDifference(previousFollowers, nowAllFollowers);

    if (newFollowersGridOptions.rowData === null) {
      // 新しいフォロワー一覧表示: 初期化
      createListView(
        newFollowersGridOptions,
        newFollowers,
        "followerDiff",
        "#new-followers"
      );
      // フォロー解除した人一覧表示: 初期化
      createListView(
        unfollowedUsersOptions,
        unfollowedUsers,
        "followerDiff",
        "#unfollowed-users"
      );
    } else {
      // 新しいフォロワー一覧表示: 更新
      newFollowersGridOptions.api.setRowData(newFollowers);
      // フォロー解除した人一覧表示: 更新
      unfollowedUsersOptions.api.setRowData(unfollowedUsers);
    }
  } else {
    await updateFollowerListInLocalStorage();
    displayFollowerDiffList(nowAllFollowers);
  }
}

async function createListView(gridOptions, data, tab, selector) {
  gridOptions.rowData = data;
  sizeColumnsToFitOnTabSwitch(gridOptions, tab);
  const gridDiv = document.querySelector(selector);
  new agGrid.Grid(gridDiv, gridOptions);
}

// get the difference between two arrays of objects
function getDifference(followers1, followers2) {
  return followers1.filter(
    (newItem) =>
      !followers2.some((oldItem) => oldItem.user_id === newItem.user_id)
  );
}

// update follower list in local storage
async function updateFollowerListInLocalStorage() {
  const previousFollowers = sessionStorage.getItem(previousFollowersKey);
  localStorage.setItem(previousFollowersKey, previousFollowers);
  localStorage.setItem(lastCheckedDate, formatToLocaleString(new Date()));
  displayLastCheckedDate();
}

// display last checked date
function displayLastCheckedDate() {
  document.getElementById("lastCheckedDate").innerText = `Last checked: ${
    localStorage.getItem(lastCheckedDate) || "none"
  }`;
}

// set follower list in session storage
function setFollowerListInSessionStorage(nowAllFollowers) {
  const comparedNowAllFollowers = nowAllFollowers.map((item) => {
    return {
      user_id: item.user_id,
      user_login: item.user_login,
    };
  });
  sessionStorage.setItem(
    previousFollowersKey,
    JSON.stringify(comparedNowAllFollowers)
  );
}

// fetch All followers
const fetchFollowers = async (channelId, cursor = "") => {
  const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channelId}&first=100&after=${cursor}`;

  const response = await fetch(url, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${localStorage.getItem(accessTokenKey)}`,
    },
  });

  // if (!response.ok) {
  //   throw new Error(
  //     `Failed to fetch followers: ${response.status} ${response.statusText}`
  //   );
  // }

  const data = await response.json();
  const followers = data.data; // 取得したフォロワーの配列

  if (data.pagination && data.pagination.cursor) {
    // ページネーションがある場合、再帰的に次のページを取得
    const nextCursor = data.pagination.cursor;
    const nextFollowers = await fetchFollowers(channelId, nextCursor);
    followers.push(...nextFollowers);
  }

  return followers;
};

function sizeColumnsToFitOnTabSwitch(gridOptions, tab) {
  // タブが切り替わった時に発生するイベントリスナーにsizeColumnsToFitを登録する
  document.querySelector("[data-tabs]").addEventListener("tabby", function (e) {
    if (e.detail && e.detail.content.id == tab) {
      gridOptions.api.sizeColumnsToFit();
    }
  });
}
