import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/integrations")({ component: () => <Navigate to="/chat" /> });
