const twitchLinkInCellRenderer = (params) =>
  `<a href="https://www.twitch.tv/${params.value}" target="_blank" rel="noopener">${params.value}</a>`;
const formatToLocaleStringCellRenderer = (params) =>
  `${formatToLocaleString(new Date(params.value))}`;

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

let gridOptions = {
  columnDefs: [
    {
      headerName: "Followed At",
      field: "followed_at",
      minWidth: 150,
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
    { headerName: "User ID", field: "user_id", minWidth: 75 },
  ],
  rowData: null,
  domLayout: "autoHeight",
  pagination: true,
  paginationPageSize: 15,
  quickFilterText: "",
  animateRows: true,
  onGridReady: (params) => params.api.sizeColumnsToFit(),
  gridSizeChanged: (params) => {console.log("change")
    params.api.sizeColumnsToFit()},
};

let newFollowersGridOptions = {
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
  domLayout: "autoHeight",
  animateRows: true,
  gridSizeChanged: (params) => params.api.sizeColumnsToFit(),
};

let unfollowedUsersOptions = {
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
  domLayout: "autoHeight",
  animateRows: true,
  gridSizeChanged: (params) => params.api.sizeColumnsToFit(),
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
    // 一覧表示 初期化
    gridOptions.rowData = nowAllFollowers;
    const gridDiv = document.querySelector("#followerList");
    new agGrid.Grid(gridDiv, gridOptions);
  } else {
    // 一覧表示 更新
    gridOptions.api.setRowData(nowAllFollowers);
  }

  // 検索窓作成
  const filterInput = document.getElementById("quickFilterInput");
  filterInput.addEventListener("input", function () {
    const filterValue = filterInput.value;
    gridOptions.api.setQuickFilter(filterValue);
  });
}

async function displayFollowerDiffList(nowAllFollowers) {
  // 更新用のフォロワーリストを作成して SessionStorage に保存しておく
  setFollowerListInSessionStorage(nowAllFollowers);

  // 差分一覧表示
  const previousFollowers = JSON.parse(
    localStorage.getItem(previousFollowersKey)
  );

  // console.log(nowAllFollowers);
  // console.log(previousFollowers);
  if (previousFollowers !== null) {
    const newFollowers = nowAllFollowers.filter(
      (newItem) =>
        !previousFollowers.some(
          (oldItem) => oldItem.user_id === newItem.user_id
        )
    );
    const unfollowedUsers = previousFollowers.filter(
      (oldItem) =>
        !nowAllFollowers.some((newItem) => newItem.user_id === oldItem.user_id)
    );

    // console.log(newFollowers);
    // console.log(unfollowedUsers);
    if (newFollowersGridOptions.rowData === null) {
      // 新しいフォロワー一覧表示 初期化
      newFollowersGridOptions.rowData = newFollowers;
      sizeColumnsToFitOnTabSwitch(newFollowersGridOptions, "followerDiff");
      const newFollowersGridDiv = document.querySelector("#newFollowers");
      new agGrid.Grid(newFollowersGridDiv, newFollowersGridOptions);
    } else {
      // 新しいフォロワー一覧表示 更新
      newFollowersGridOptions.api.setRowData(newFollowers);
    }

    if (unfollowedUsersOptions.rowData === null) {
      // フォロー解除した人一覧表示 初期化
      unfollowedUsersOptions.rowData = unfollowedUsers;
      sizeColumnsToFitOnTabSwitch(unfollowedUsersOptions, "followerDiff");
      const unfollowedUsersGridDiv = document.querySelector("#unfollowedUsers");
      new agGrid.Grid(unfollowedUsersGridDiv, unfollowedUsersOptions);
    } else {
      // フォロー解除した人一覧表示 更新
      unfollowedUsersOptions.api.setRowData(unfollowedUsers);
    }
  } else {
    // 初回はフォロワーリストをローカルストレージに保存
    await updateFollowerListInLocalStorage();
    // grid を再描画
    displayFollowerDiffList(nowAllFollowers);
  }
}

function displayLastCheckedDate() {
  // Last checked を表示
  document.getElementById("lastCheckedDate").innerText = `Last checked: ${
    localStorage.getItem(lastCheckedDate) || "none"
  }`;
}

async function updateFollowerListInLocalStorage() {
  const previousFollowers = sessionStorage.getItem(previousFollowersKey);
  localStorage.setItem(previousFollowersKey, previousFollowers);
  localStorage.setItem(lastCheckedDate, formatToLocaleString(new Date()));
  displayLastCheckedDate();
}

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

const fetchFollowers = async (channelId, cursor = "") => {
  const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channelId}&first=100&after=${cursor}`;

  const response = await fetch(url, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${localStorage.getItem(accessTokenKey)}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch followers: ${response.status} ${response.statusText}`
    );
  }

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

function sizeColumnsToFitOnWindowResize(grid) {
  window.addEventListener("resize", () => {
    grid.sizeColumnsToFit();
  });
}
