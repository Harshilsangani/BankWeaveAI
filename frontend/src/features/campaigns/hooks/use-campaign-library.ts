"use client";
import { useCallback, useEffect, useState } from "react";
import { getCampaignReports, getStaffNotifications } from "@/features/campaigns/api";
import type { CampaignReport, StaffNotification } from "@/features/campaigns/types";

export function useCampaignLibrary() {
  const [reports, setReports] = useState<CampaignReport[]>([]);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [saved, inbox] = await Promise.all([getCampaignReports(), getStaffNotifications()]);
      setReports(saved);
      setNotifications(inbox);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Campaign reports could not be loaded.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const onReady = () => {
      void refresh();
    };
    window.addEventListener("bankweave-campaign-ready", onReady);
    return () => {
      clearInterval(timer);
      window.removeEventListener("bankweave-campaign-ready", onReady);
    };
  }, [refresh]);
  const removeNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);
  return {
    reports,
    notifications,
    error,
    refresh,
    removeNotification,
    clearNotifications,
    unread: notifications.filter((item) => !item.readAt).length,
  };
}
