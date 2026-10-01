import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingScreen } from "../ui";

/** <Outlet/> with its own Suspense boundary, so layouts stay on screen while a lazy page loads. */
export function SuspenseOutlet({ children }) {
  return <Suspense fallback={<LoadingScreen />}>{children ?? <Outlet />}</Suspense>;
}
