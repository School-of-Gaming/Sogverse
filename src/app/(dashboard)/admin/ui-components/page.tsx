"use client";

import {
  Plus,
  Pencil,
  Trash,
  Search,
  Eye,
  EyeOff,
  Settings,
  Users,
  Package,
  TrendingUp,
  DollarSign,
  Gamepad2,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="rounded-lg border p-6 space-y-6">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Swatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`h-12 w-12 rounded-lg border ${className}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminUIComponentsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">UI Components</h1>
        <p className="text-muted-foreground">
          Living style guide &mdash; every component variant, composite pattern,
          and color token used across the app.
        </p>
      </div>

      {/* ============================================================ */}
      {/* Section 1: Color Palette                                      */}
      {/* ============================================================ */}
      <Section title="Color Palette">
        <SubSection title="Brand Colors">
          <div className="flex flex-wrap gap-4">
            <Swatch label="Primary" className="bg-primary" />
            <Swatch label="Secondary" className="bg-secondary" />
            <Swatch label="Destructive" className="bg-destructive" />
            <Swatch label="Success" className="bg-success" />
            <Swatch label="Accent" className="bg-accent" />
          </div>
        </SubSection>

        <SubSection title="Surface Colors">
          <div className="flex flex-wrap gap-4">
            <Swatch label="Background" className="bg-background" />
            <Swatch label="Card" className="bg-card" />
            <Swatch label="Muted" className="bg-muted" />
            <Swatch label="Border" className="bg-border" />
            <Swatch label="Ring" className="bg-ring" />
          </div>
        </SubSection>

        <SubSection title="Text Colors">
          <div className="flex flex-wrap gap-6">
            <span className="text-sm font-medium text-foreground">
              Foreground
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              Muted Foreground
            </span>
            <span className="text-sm font-medium text-primary">Primary</span>
            <span className="text-sm font-medium text-secondary">
              Secondary
            </span>
            <span className="text-sm font-medium text-destructive">
              Destructive
            </span>
            <span className="text-sm font-medium text-success">
              Success
            </span>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 2: Buttons                                            */}
      {/* ============================================================ */}
      <Section title="Button">
        <SubSection title="Variants">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default">Default</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </SubSection>

        <SubSection title="Sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </SubSection>

        <SubSection title="Disabled">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Default</Button>
            <Button variant="destructive" disabled>
              Destructive
            </Button>
            <Button variant="outline" disabled>
              Outline
            </Button>
            <Button variant="secondary" disabled>
              Secondary
            </Button>
          </div>
        </SubSection>

        <SubSection title="With Icons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
            <Button variant="secondary">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive">
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 3: Badge                                              */}
      {/* ============================================================ */}
      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Section 4: Card                                               */}
      {/* ============================================================ */}
      <Section title="Card">
        <SubSection title="Full Card">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>
                Card description with supporting text
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Card body content goes here. This demonstrates all sub-components.
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Save</Button>
            </CardFooter>
          </Card>
        </SubSection>

        <SubSection title="Minimal Card">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Minimal Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Header and content only &mdash; no description or footer.
              </p>
            </CardContent>
          </Card>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 5: Input & Label                                      */}
      {/* ============================================================ */}
      <Section title="Input & Label">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="demo-default">Default</Label>
            <Input id="demo-default" placeholder="Placeholder text..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-value">With Value</Label>
            <Input id="demo-value" defaultValue="Hello world" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-disabled">Disabled</Label>
            <Input id="demo-disabled" disabled placeholder="Cannot edit" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-file">File Input</Label>
            <Input id="demo-file" type="file" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-search">With Search Icon</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="demo-search"
                placeholder="Search..."
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* Section 6: Avatar & Identicon                                 */}
      {/* ============================================================ */}
      <Section title="Avatar & Identicon">
        <SubSection title="Identicons (different IDs)">
          <div className="flex flex-wrap items-center gap-4">
            {["alice", "bob", "charlie", "dave", "eve"].map((id) => (
              <div key={id} className="flex flex-col items-center gap-1.5">
                <Avatar>
                  <AvatarImage src={undefined} />
                  <Identicon id={id} />
                </Avatar>
                <span className="text-xs text-muted-foreground">{id}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title="Size Comparison">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <Avatar>
                <Identicon id="size-demo" />
              </Avatar>
              <span className="text-xs text-muted-foreground">
                Default (40px)
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Avatar className="h-12 w-12">
                <Identicon id="size-demo" size={48} />
              </Avatar>
              <span className="text-xs text-muted-foreground">48px</span>
            </div>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 7: Feedback Alerts                                    */}
      {/* ============================================================ */}
      <Section title="Feedback">
        <SubSection title="Inline Alerts">
          <div className="space-y-3 max-w-lg">
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              Profile updated successfully!
            </div>
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Something went wrong. Please try again.
            </div>
          </div>
        </SubSection>

        <SubSection title="Success Icon Circle">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <span className="text-xs text-muted-foreground">
              bg-success/10 + text-success
            </span>
          </div>
        </SubSection>

        <SubSection title="Error Icon Circle">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">
              bg-destructive/10 + text-destructive
            </span>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/* Section 8: Composite Patterns                                 */}
      {/* ============================================================ */}
      <Section title="Composite Patterns">
        {/* -- Hoverable List Item (admin products) -- */}
        <SubSection title="Hoverable List Item (admin/products)">
          <div className="space-y-2">
            {["Sogverse Pro", "Starter Pack"].map((name, i) => (
              <div
                key={name}
                className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                    <span className="text-2xl">{i === 0 ? "🎮" : "📦"}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{name}</p>
                      {i === 1 && (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground group-hover:text-accent-foreground/70"
                        >
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground group-hover:text-accent-foreground/70 line-clamp-1">
                      Sample product description
                    </p>
                    <p className="text-sm font-semibold text-primary group-hover:text-secondary">
                      {i === 0 ? "$49.99" : "$9.99"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground"
                    title={i === 0 ? "Deactivate" : "Activate"}
                  >
                    {i === 0 ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground hover:!bg-destructive/80 hover:!text-destructive-foreground"
                    title="Delete"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SubSection>

        {/* -- Hoverable Card (customer gamers) -- */}
        <SubSection title="Hoverable Card (customer/gamers)">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { name: "PlayerOne", username: "player1" },
              { name: "GamerKid", username: "gamerkid" },
            ].map((gamer) => (
              <Card
                key={gamer.username}
                className="group transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={undefined} />
                        <Identicon id={gamer.username} size={48} />
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">
                          {gamer.name}
                        </CardTitle>
                        <CardDescription className="group-hover:text-accent-foreground/70">
                          @{gamer.username}
                        </CardDescription>
                      </div>
                    </div>
                    <Gamepad2 className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground/70" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground group-hover:text-accent-foreground/70">
                      Joined 3 days ago
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group-hover:bg-secondary group-hover:text-secondary-foreground hover:!bg-secondary/80 hover:!text-secondary-foreground"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SubSection>

        {/* -- Stat Card (admin dashboard) -- */}
        <SubSection title="Stat Card (admin dashboard)">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Total Users",
                value: "128",
                description: "Active accounts",
                icon: Users,
              },
              {
                title: "Products",
                value: "24",
                description: "Active products",
                icon: Package,
              },
              {
                title: "Revenue",
                value: "$4,320",
                description: "This month",
                icon: DollarSign,
              },
              {
                title: "Growth",
                value: "+12%",
                description: "From last month",
                icon: TrendingUp,
              },
            ].map((stat) => (
              <Card
                key={stat.title}
                className="group transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground/70" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground group-hover:text-accent-foreground/70">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </SubSection>

        {/* -- Loading Skeleton -- */}
        <SubSection title="Loading Skeleton">
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-lg border p-4 animate-pulse"
              >
                <div className="h-16 w-16 rounded bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-48 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </SubSection>
      </Section>
    </div>
  );
}
