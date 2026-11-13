import { getShellData } from "@/lib/shell";
import { ShellClient, type ShellActive } from "./ShellClient";

/** Server wrapper: loads shell data (user, unread, workspace, WhatsApp connection) once per page render. */
export async function AppShell(props: {
  active: ShellActive;
  title: string;
  actions?: React.ReactNode;
  fixed?: boolean;
  children: React.ReactNode;
}) {
  const data = await getShellData();
  return <ShellClient {...props} data={data} />;
}
