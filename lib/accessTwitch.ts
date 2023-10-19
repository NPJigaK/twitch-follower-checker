import { useEffect, useState, useCallback } from "react";
import { clientId, accessTokenKey, storedAllFollowersKey } from "./constants";
import { debugLogger } from "./debugLogger";

export function useIsTwitchTokenAvailable() {
  const [isTwitchTokenAvailable, setIsTwitchTokenAvailable] = useState<
    null | boolean
  >(null);

  useEffect(() => {
    const checkAndStoreAccessToken = async () => {
      let accessTokenFromHash = null;

      if (typeof window !== "undefined") {
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        accessTokenFromHash = hashParams.get("access_token");
      }

      if (accessTokenFromHash) {
        // localstorageにaccess_tokenを保存
        localStorage.setItem(accessTokenKey, accessTokenFromHash);
      }

      // localstorageからaccess_tokenを取得
      const accessToken = localStorage.getItem(accessTokenKey);
      if (!accessToken) {
        setIsTwitchTokenAvailable(false);
        return;
      }

      // access_tokenがexpiredしていないかfetchで確認
      const response = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await response.json();

      if (response.status === 401 || data.expires_in < 3600) {
        setIsTwitchTokenAvailable(false);
      } else {
        setIsTwitchTokenAvailable(true);
      }
    };

    checkAndStoreAccessToken();
  }, []);

  return isTwitchTokenAvailable;
}

export const useNowAllFollowers = () => {
  const [nowAllFollowers, setNowAllFollowers] = useState<any[] | null>(null);
  const [newAllFollowers, setNewAllFollowers] = useState<any[] | null>(null);
  const [oldAllFollowers, setOldAllFollowers] = useState<any[] | null>(null);

  const fetchFollowers = useCallback(
    async (channelId: string, cursor = ""): Promise<any[]> => {
      const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channelId}&first=100&after=${cursor}`;

      const response = await fetch(url, {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${localStorage.getItem(accessTokenKey)}`,
        },
      });

      const data = await response.json();
      const followers = data.data; // 取得したフォロワーの配列

      if (data.pagination && data.pagination.cursor) {
        // ページネーションがある場合、再帰的に次のページを取得
        const nextCursor = data.pagination.cursor;
        const nextFollowers = await fetchFollowers(channelId, nextCursor);
        followers.push(...nextFollowers);
      }
      debugLogger("fetchFollowers");
      return followers;
    },
    [] // 依存配列は空のまま
  );

  type User = { user_id: string; [key: string]: any };
  const findDifference = useCallback(
    async (oldArray: User[], newArray: User[]) => {
      const oldUserIds = oldArray.map((user) => user.user_id);
      const newUserIds = newArray.map((user) => user.user_id);

      const removedUsers = oldArray.filter(
        (user) => !newUserIds.includes(user.user_id)
      );
      const addedUsers = newArray.filter(
        (user) => !oldUserIds.includes(user.user_id)
      );

      return { removedUsers, addedUsers };
    },
    []
  );

  const refresh = useCallback(async () => {
    debugLogger("refresh");

    const res = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem(accessTokenKey)}`,
        "Client-Id": clientId,
      },
    });
    const resJson = await res.json();
    const followers = await fetchFollowers(resJson.data[0].id);

    const result = await findDifference(
      followers,
      JSON.parse(localStorage.getItem(storedAllFollowersKey) ?? "[]")
    );
    debugLogger(result.removedUsers);
    debugLogger(result.addedUsers);
    setNowAllFollowers(followers);
    setNewAllFollowers(result.removedUsers);
    setOldAllFollowers(result.addedUsers);
  }, [fetchFollowers, findDifference]); // fetchFollowers は依存配列に含まれています

  useEffect(() => {
    refresh(); // コンポーネントがマウントされた時に refresh 関数を呼び出します
  }, [refresh]); // refresh は依存配列に含まれています

  const storeNowFollowes = useCallback(() => {
    debugLogger("storeNowFollowes");
    localStorage.setItem(
      storedAllFollowersKey,
      JSON.stringify(nowAllFollowers ?? [])
    );
  }, [nowAllFollowers]);

  return {
    nowAllFollowers,
    newAllFollowers,
    oldAllFollowers,
    refresh,
    storeNowFollowes,
  };
};
