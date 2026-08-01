#!/usr/bin/env perl
#
# Record the expected output of tests/perl-compat/cases.json by running every
# case through Perl HTML::Template, and write tests/perl-compat/goldens.json.
#
# The generated file is committed, so the compatibility suite runs in CI
# without a Perl install. Re-run this only when cases are added or changed:
#
#   perl scripts/record-perl-goldens.pl                 # uses installed HTML::Template
#   perl scripts/record-perl-goldens.pl /path/to/lib    # uses a checkout instead
#
# A case that dies records ok => 0 plus Perl's message. The message is kept for
# documentation only; the suite asserts that the port fails, not how it words it.

use strict;
use warnings;
use File::Basename qw(dirname);
use File::Spec;
use File::Temp qw(tempdir);
use JSON::PP;

BEGIN {
    unshift @INC, $ARGV[0] if @ARGV && -d $ARGV[0];
}

use HTML::Template;

my $root     = File::Spec->rel2abs(File::Spec->catdir(dirname(__FILE__), File::Spec->updir));
my $cases_in = File::Spec->catfile($root, 'tests', 'perl-compat', 'cases.json');
my $out_file = File::Spec->catfile($root, 'tests', 'perl-compat', 'goldens.json');

# Emit the same shape the repo's formatter produces, so the generated file
# does not fight `yarn lint`.
my $json  = JSON::PP->new->utf8->canonical(1)->indent(1)->indent_length(2)->space_after(1);
my $cases = $json->decode(slurp($cases_in));

my %goldens;
for my $case (@$cases) {
    $goldens{ $case->{id} } = run_case($case);
}

open(my $out, '>:raw', $out_file) or die "cannot write $out_file: $!";
print {$out} $json->encode(\%goldens);
close $out;

printf STDERR "recorded %d cases from HTML::Template %s\n", scalar(@$cases), $HTML::Template::VERSION;

# Run one case and capture either its output or the fact that it died.
sub run_case {
    my ($case) = @_;

    my $result = eval { +{ ok => 1, out => invoke($case) } };
    return $result if $result;

    my $error = $@;
    $error =~ s/\s+at\s+\S+\s+line\s+\d+\.?//g;
    $error =~ s/\s+\z//;
    return { ok => 0, err => $error };
}

# Build the template described by a case and perform its action.
sub invoke {
    my ($case) = @_;

    my %options = %{ $case->{opts} || {} };
    $options{associate} = FakeCGI->new(%{ $case->{associate} }) if $case->{associate};
    $options{filter}    = named_filter($case->{filter})        if $case->{filter};

    if ($case->{includes}) {
        my $dir = tempdir(CLEANUP => 1);
        while (my ($name, $body) = each %{ $case->{includes} }) {
            open(my $fh, '>:raw', File::Spec->catfile($dir, $name)) or die $!;
            print {$fh} $body;
            close $fh;
        }
        $options{path} = [$dir];
    }

    my $text     = $case->{tmpl};
    my $template = HTML::Template->new(scalarref => \$text, %options);

    for my $name (sort keys %{ $case->{params} || {} }) {
        $template->param($name, $case->{params}{$name});
    }

    $template->clear_params if $case->{clear};

    return join(',', sort $template->query())                        if $case->{query};
    return join(',', sort $template->param())                        if $case->{paramlist};
    return join(',', sort grep { defined } $template->query(loop => $case->{queryloop}))
      if $case->{queryloop};

    if ($case->{queryname}) {
        my $type = $template->query(name => $case->{queryname});
        return defined $type ? $type : '(undef)';
    }

    if ($case->{get}) {
        my $value = $template->param($case->{get});
        return defined $value ? $value : '(undef)';
    }

    return $template->output;
}

# Filters are referenced by name so the same behaviour can be reproduced by
# the TypeScript runner.
sub named_filter {
    my ($name) = @_;

    return sub { ${ $_[0] } =~ s/XX(\w+)XX/<TMPL_VAR NAME=$1>/g } if $name eq 'xx-to-tag';

    die "unknown filter '$name'";
}

sub slurp {
    my ($path) = @_;
    open(my $fh, '<:raw', $path) or die "cannot read $path: $!";
    local $/;
    my $content = <$fh>;
    close $fh;
    return $content;
}

# Minimal stand-in for CGI.pm: param() with no argument lists the names.
package FakeCGI;

sub new {
    my ($class, %values) = @_;
    return bless { values => {%values} }, $class;
}

sub param {
    my ($self, $name) = @_;
    return keys %{ $self->{values} } unless defined $name;
    return $self->{values}{$name};
}
