import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "@/app/register/page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

function renderRegisterPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  pushMock.mockClear();
});

describe("RegisterPage", () => {
  it("shows field errors and never calls the API when submitted empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderRegisterPage();

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/username must be at least 3 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a field's error as soon as it's edited", async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/username must be at least 3 characters/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/username/i), "alice");
    expect(screen.queryByText(/username must be at least 3 characters/i)).not.toBeInTheDocument();
  });

  it("submits valid input to POST /auth/register and redirects to /login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(201, {
        id: "user-1",
        username: "alice",
        email: "alice@example.com",
        created_at: "2024-01-01T00:00:00Z",
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "correcthorsebattery");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/auth/register");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      username: "alice",
      email: "alice@example.com",
      password: "correcthorsebattery",
    });
  });

  it("shows the backend's error message on a 409 duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(409, { detail: "A user with that username or email already exists" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "correcthorsebattery");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
