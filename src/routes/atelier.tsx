import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/atelier")({ component: () => <Navigate to="/chat" /> });
